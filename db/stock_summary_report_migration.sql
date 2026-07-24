-- ============================================================
-- Card: "รายงานสรุปสต็อก (Stock Summary Report) — Pro+"
-- (Notion page 3a1f39f4564981d1a15ed167dcd8031b)
--
-- ⚠️ LOAD-BEARING CONSTRAINT (the card's own warning, repeated here on purpose):
-- Section 1 (on-balance-sheet stock value) MUST use the EXACT SAME cost formula as the
-- Stock Value Cap Engine (shops.current_stock_value, maintained by trg_update_shop_stock_value
-- in db/stock_value_cap_allocated_cost_migration.sql), or the two numbers will silently
-- disagree over time. That trigger's formula (for every active part) is:
--
--     coalesce(allocated_cost, price, 0) * coalesce(quantity, 0)   -- summed over is_active=true
--
-- This migration does NOT re-derive that formula independently. It copies the expression
-- verbatim into fn_shop_stock_parts_detail() below (SQL, not a re-implementation in JS/app
-- code), and every other function in this file that needs a part's cost contribution calls
-- THIS function rather than repeating the expression a third time. This mirrors the same
-- "documented duplication, not silent drift" approach this project already uses for the
-- stock-value-cap numbers themselves (see config/subscriptionTiers.js's own comment about
-- fn_tier_stock_cap needing to match SUBSCRIPTION_TIERS by hand) — there is genuinely no way
-- in Postgres to "call" a trigger function's inline per-row expression from a plain query, so
-- textual identity + a big comment pointing both ways is the best available guardrail.
--
-- Verification query to confirm the two never drift for a given shop (no owner_type split,
-- i.e. the raw base formula the engine itself uses):
--   select s.shop_id, s.current_stock_value, fn_shop_parts_stock_value(s.shop_id) as report_says
--   from shops s;  -- both columns must always match exactly
--
-- ------------------------------------------------------------
-- Effective owner_type (card's resolved ❓, verified against actual schema this session):
--   zones.owner_type_check      -> 'own' | 'consignment' | 'investor'  (zones_owner_type_migration.sql)
--   parts.owner_type_override   -> null | 'own' | 'consignment' | 'investor' (zone_move_action_migration.sql)
-- Effective owner_type of a part = coalesce(parts.owner_type_override, <part's zone's owner_type>).
-- 'own' -> counts in Section 1 (on-balance). 'consignment'/'investor' -> Section 2 only (memo,
-- off-balance) — the card's text only says "ฝากขาย/consignment" but the actual DB constraint
-- allows a 3rd value ('investor') that isn't "own" either, so both non-'own' values are treated
-- as off-balance here (a part that isn't the shop's own inventory shouldn't appear on-balance
-- regardless of which non-'own' bucket it is).
--
-- Salvage vehicles themselves don't have their own owner_type_override column (only parts do);
-- a vehicle's effective owner_type is taken from its zone the same way. This is a judgment call
-- (the card never explicitly addresses vehicle-level consignment) — flagged so it can be revisited.
--
-- ------------------------------------------------------------
-- NOT implemented this run (explicitly deferred, matching card + task scope):
--   - Month-end / point-in-time snapshot reporting — this is real-time only, same as the Stock
--     Value Cap Engine itself. Re-stating a report "as of" a past date would need either an
--     immutable ledger of every parts/part_sales change over time, or periodic snapshot rows —
--     neither exists in this schema. Known gap, not attempted.
--   - Brand-level breakdown of "remaining salvage vehicle value" (section 1's 3rd cost source).
--     salvage_vehicles has no direct car_brand column (only generation_id/trim_id, which would
--     need a 3-hop join through model_generations -> models -> brands to resolve a brand name).
--     Remaining vehicle value is broken down by zone only, not by brand, in this pass — flagged
--     as a scoping simplification, not a silent omission.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Per-part cost contribution + ownership/location detail, for a single shop.
--    THE reused formula lives here (see big comment above) — every other function in this file
--    that needs a part's stock-value contribution is built ON TOP of this, never re-expresses
--    coalesce(allocated_cost, price, 0) * quantity a second time.
-- ------------------------------------------------------------
create or replace function fn_shop_stock_parts_detail(p_shop_id bigint)
returns table (
  part_id uuid,
  car_brand text,
  condition text,
  zone_id uuid,
  zone_name text,
  salvage_vehicle_id bigint,
  effective_owner_type text,
  cost_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as part_id,
    p.car_brand,
    p.condition,
    p.zone_id,
    z.name as zone_name,
    p.salvage_vehicle_id,
    coalesce(p.owner_type_override, z.owner_type, 'own') as effective_owner_type,
    -- ⬇️ verbatim copy of the Stock Value Cap Engine's per-row expression (see top comment) ⬇️
    coalesce(p.allocated_cost, p.price, 0) * coalesce(p.quantity, 0) as cost_value
  from parts p
  left join zones z on z.id = p.zone_id
  where p.shop_id = p_shop_id
    and p.is_active = true;
$$;

comment on function fn_shop_stock_parts_detail(bigint) is
  'Per-part cost contribution for a shop, using the exact same formula as
   fn_update_shop_stock_value() (Stock Value Cap Engine) — do not change this expression without
   also updating db/stock_value_cap_allocated_cost_migration.sql to match, or the cross-feature
   invariant (Stock Summary Report section 1 vs shops.current_stock_value) will silently drift.';

-- Total parts-value across ALL owner_types (own + consignment + investor combined) — this is
-- the number that must equal shops.current_stock_value exactly (the engine itself has no
-- owner_type concept yet, it counts every active part regardless of ownership).
create or replace function fn_shop_parts_stock_value(p_shop_id bigint)
returns numeric
language sql
stable
as $$
  select coalesce(sum(cost_value), 0) from fn_shop_stock_parts_detail(p_shop_id);
$$;

-- ------------------------------------------------------------
-- 2) Remaining (not-yet-allocated) value of salvage vehicles still being disassembled.
--    = purchase_price - Σ allocated_cost of parts already pulled from that vehicle.
--    Only vehicles NOT fully_disassembled/sold_whole carry remaining value (once fully
--    disassembled, the "ขายเศษเหล็ก" RPC guarantees Σ allocated_cost == purchase_price exactly —
--    see db/salvage_vehicle_cost_allocation_migration.sql section 1 comment — so remaining is 0).
-- ------------------------------------------------------------
create or replace function fn_shop_vehicle_remaining_detail(p_shop_id bigint)
returns table (
  vehicle_id bigint,
  status text,
  zone_id uuid,
  zone_name text,
  effective_owner_type text,
  purchase_price numeric,
  allocated_so_far numeric,
  remaining_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.vehicle_id,
    v.status,
    v.zone_id,
    z.name as zone_name,
    coalesce(z.owner_type, 'own') as effective_owner_type,
    v.purchase_price,
    coalesce((select sum(p.allocated_cost) from parts p where p.salvage_vehicle_id = v.vehicle_id), 0) as allocated_so_far,
    greatest(
      coalesce(v.purchase_price, 0) -
      coalesce((select sum(p.allocated_cost) from parts p where p.salvage_vehicle_id = v.vehicle_id), 0),
      0
    ) as remaining_value
  from salvage_vehicles v
  left join zones z on z.id = v.zone_id
  where v.shop_id = p_shop_id
    and v.status not in ('fully_disassembled', 'sold_whole');
$$;

create or replace function fn_shop_vehicle_remaining_value(p_shop_id bigint)
returns numeric
language sql
stable
as $$
  select coalesce(sum(remaining_value), 0) from fn_shop_vehicle_remaining_detail(p_shop_id);
$$;

-- ------------------------------------------------------------
-- 3) Section 1 + Section 2 combined summary (own vs consignment/investor split), the report's
--    headline numbers. Kept as one function so "section 1 total + section 2 total" is
--    guaranteed (by construction) to equal the grand total across all owner_types.
-- ------------------------------------------------------------
create or replace function fn_shop_stock_summary_totals(p_shop_id bigint)
returns table (
  onbalance_parts_value numeric,       -- section 1, owner_type = 'own' parts only
  onbalance_vehicle_remaining numeric, -- section 1, 'own' vehicles' remaining value
  onbalance_total numeric,             -- section 1 grand total
  offbalance_parts_value numeric,      -- section 2 (memo only), consignment+investor parts
  offbalance_vehicle_remaining numeric,-- section 2 (memo only), consignment+investor vehicles
  offbalance_total numeric,            -- section 2 grand total
  all_owner_types_parts_value numeric  -- == fn_shop_parts_stock_value(p_shop_id) == shops.current_stock_value
)
language sql
stable
as $$
  select
    coalesce(sum(d.cost_value) filter (where d.effective_owner_type = 'own'), 0),
    coalesce((select sum(r.remaining_value) from fn_shop_vehicle_remaining_detail(p_shop_id) r
              where r.effective_owner_type = 'own'), 0),
    coalesce(sum(d.cost_value) filter (where d.effective_owner_type = 'own'), 0)
      + coalesce((select sum(r.remaining_value) from fn_shop_vehicle_remaining_detail(p_shop_id) r
                  where r.effective_owner_type = 'own'), 0),
    coalesce(sum(d.cost_value) filter (where d.effective_owner_type <> 'own'), 0),
    coalesce((select sum(r.remaining_value) from fn_shop_vehicle_remaining_detail(p_shop_id) r
              where r.effective_owner_type <> 'own'), 0),
    coalesce(sum(d.cost_value) filter (where d.effective_owner_type <> 'own'), 0)
      + coalesce((select sum(r.remaining_value) from fn_shop_vehicle_remaining_detail(p_shop_id) r
                  where r.effective_owner_type <> 'own'), 0),
    coalesce(sum(d.cost_value), 0)
  from fn_shop_stock_parts_detail(p_shop_id) d;
$$;

-- ------------------------------------------------------------
-- 4) Section 3 — per-vehicle status table. Cost recognized = Σ allocated_cost of parts from
--    that vehicle that have ACTUALLY BEEN SOLD (not merely disassembled) — matches the card's
--    exact test scenario ("ถอด 10 ขาย 4 -> กำไรสะสม ใช้ allocated_cost ของ 4 ชิ้นที่ขายเท่านั้น").
--    "Sold" excludes item_status='not_found' (stock was returned, no real sale — see
--    app/admin/reports/page.js's own query for this same exclusion) and
--    approval_status='pending_approval' (not yet approved — SOP.md ข้อ "ขายของที่ยังไม่ตีราคา"
--    explicitly says these don't count into Stock Summary Report until approved).
--    A part sold across multiple part_sales rows (partial-quantity sales) must only contribute
--    its allocated_cost ONCE, not once per sale row — done via a scalar subquery over DISTINCT
--    sold parts, not a join (a join would double/triple count allocated_cost per extra sale row).
-- ------------------------------------------------------------
create or replace function fn_shop_salvage_vehicle_summary(p_shop_id bigint)
returns table (
  vehicle_id bigint,
  status text,
  purchase_price numeric,
  cumulative_revenue numeric,
  cost_recognized numeric,
  profit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.vehicle_id,
    v.status,
    v.purchase_price,
    coalesce((
      select sum(ps.quantity_sold * ps.sale_price)
      from part_sales ps
      join parts p on p.id = ps.part_id
      where p.salvage_vehicle_id = v.vehicle_id
        and ps.shop_id = p_shop_id
        and ps.item_status <> 'not_found'
        and ps.approval_status <> 'pending_approval'
    ), 0) as cumulative_revenue,
    coalesce((
      select sum(p.allocated_cost)
      from parts p
      where p.salvage_vehicle_id = v.vehicle_id
        and exists (
          select 1 from part_sales ps
          where ps.part_id = p.id
            and ps.shop_id = p_shop_id
            and ps.item_status <> 'not_found'
            and ps.approval_status <> 'pending_approval'
        )
    ), 0) as cost_recognized,
    coalesce((
      select sum(ps.quantity_sold * ps.sale_price)
      from part_sales ps
      join parts p on p.id = ps.part_id
      where p.salvage_vehicle_id = v.vehicle_id
        and ps.shop_id = p_shop_id
        and ps.item_status <> 'not_found'
        and ps.approval_status <> 'pending_approval'
    ), 0)
    -
    coalesce((
      select sum(p.allocated_cost)
      from parts p
      where p.salvage_vehicle_id = v.vehicle_id
        and exists (
          select 1 from part_sales ps
          where ps.part_id = p.id
            and ps.shop_id = p_shop_id
            and ps.item_status <> 'not_found'
            and ps.approval_status <> 'pending_approval'
        )
    ), 0) as profit
  from salvage_vehicles v
  where v.shop_id = p_shop_id
  order by v.vehicle_id;
$$;

-- ------------------------------------------------------------
-- 5) Lock down direct RPC access — these functions take a raw p_shop_id with NO caller-vs-shop
--    membership check inside them (they're meant to be called server-side via supabaseAdmin,
--    which already verified the caller's membership/role/tier in app/api/reports/stock-summary/
--    route.js before ever calling these). Postgres grants EXECUTE to PUBLIC by default — left
--    ungated, ANY authenticated user could pass an arbitrary shop_id and read another shop's
--    stock valuation/vehicle costs. Same gap class already fixed once in this project (see
--    db/salvage_vehicle_cost_allocation_migration.sql's revoke on fn_allocate_salvage_part_cost
--    and auto_start_salvage_disassembly) — revoked here from the start instead of found later.
-- ------------------------------------------------------------
revoke execute on function fn_shop_stock_parts_detail(bigint) from public, anon, authenticated;
revoke execute on function fn_shop_parts_stock_value(bigint) from public, anon, authenticated;
revoke execute on function fn_shop_vehicle_remaining_detail(bigint) from public, anon, authenticated;
revoke execute on function fn_shop_vehicle_remaining_value(bigint) from public, anon, authenticated;
revoke execute on function fn_shop_stock_summary_totals(bigint) from public, anon, authenticated;
revoke execute on function fn_shop_salvage_vehicle_summary(bigint) from public, anon, authenticated;

-- server-side callers use supabaseAdmin (service_role key) — grant back explicitly, same
-- convention as db/platform_admin_rpc_auth_check_migration.sql / db/platform_revenue_migration.sql
grant execute on function fn_shop_stock_parts_detail(bigint) to service_role;
grant execute on function fn_shop_parts_stock_value(bigint) to service_role;
grant execute on function fn_shop_vehicle_remaining_detail(bigint) to service_role;
grant execute on function fn_shop_vehicle_remaining_value(bigint) to service_role;
grant execute on function fn_shop_stock_summary_totals(bigint) to service_role;
grant execute on function fn_shop_salvage_vehicle_summary(bigint) to service_role;

-- ------------------------------------------------------------
-- Verification queries (run manually after applying):
--   -- (a) base formula invariant vs the engine, ALL owner_types (should always match):
--   select s.shop_id, s.current_stock_value, fn_shop_parts_stock_value(s.shop_id)
--   from shops s;
--
--   -- (b) section1 + section2 add up to the all-owner-types total:
--   select shop_id, (t.onbalance_total + t.offbalance_total) as combined,
--          t.all_owner_types_parts_value + fn_shop_vehicle_remaining_value(shop_id) as expected
--   from shops s, lateral fn_shop_stock_summary_totals(s.shop_id) t;
-- ------------------------------------------------------------
