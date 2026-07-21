-- ============================================================
-- Card: "Area/Rack/Level location hierarchy (ltree)"
--
-- SCHEMA DRIFT FOUND (21 ก.ค. 2026, nightly run #3 — same pattern flagged
-- repeatedly in SOP.md "กระบวนการกัน Schema Drift"): the Notion card says
-- "Not started", but on staging the hierarchy is almost entirely live already
-- — `zones.parent_id`, `zones.path` (real `ltree`), the two path-maintenance
-- triggers, the unique-code-per-parent index, and `parts.zone_id` all exist
-- and the app (ZoneCascadeSelect.js, ZoneAutocomplete.js, zoneHelpers.js,
-- app/page.js zoneFilter, app/admin/zones/page.js) is already built against
-- them. None of it was ever exported to a migration file — a fresh install
-- or the beta project would be missing this table shape entirely.
--
-- What THIS file does:
--   1. Re-create the live DB state here so it's captured in git (idempotent —
--      safe to run against staging where it already exists, or a fresh DB).
--   2. Fix one real gap found while cross-checking the card's decisions
--      against the actual trigger/RLS code (see notes below) — this part is
--      new logic, not just an export.
--
-- Verified against staging (qmqabtrrubqcmafietsr) directly via SQL before
-- writing this file:
--   - `ltree` extension enabled, `zones.path` is a real ltree column (not text)
--   - 157 zones, all already have `path` populated
--   - trg_zones_set_path (BEFORE INSERT) / trg_zones_update_path (BEFORE UPDATE)
--     exist and already implement cycle-prevention (raise on moving a zone
--     under its own descendant) — captured verbatim below via prosrc
--   - `zones_unique_code_per_parent` unique index exists, using
--     COALESCE(parent_id, '00000000-...') so top-level Areas are covered too
--     (matches card decision: code unique only under the same parent)
--   - the 4 parts rows on staging all have zone_code=NULL AND zone_id=NULL —
--     there is no real legacy data to migrate on staging/beta right now, but
--     the migration script in section 4 is still needed for real shop data
--     later (this is a decided, required part of the card, not optional)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extension + columns
-- ------------------------------------------------------------
create extension if not exists ltree;

alter table zones add column if not exists parent_id uuid references zones(id);
alter table zones add column if not exists path ltree;

alter table parts add column if not exists zone_id uuid references zones(id);

create index if not exists idx_zones_parent_id on zones (parent_id);
create index if not exists idx_zones_path on zones using gist (path);
create index if not exists idx_parts_zone_id on parts (zone_id);

-- Unique code scoped to parent (card decision: คนละ Area ใช้ code ซ้ำกันได้,
-- แต่ต้อง unique ภายใต้ parent เดียวกัน) — COALESCE so root-level Areas
-- (parent_id IS NULL) are compared against each other too, not exempted.
create unique index if not exists zones_unique_code_per_parent
  on zones (shop_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- ------------------------------------------------------------
-- 2) path auto-maintenance (self-reference → ltree), with cycle prevention
-- ------------------------------------------------------------
create or replace function zones_set_path()
returns trigger
language plpgsql
as $$
declare
  parent_path ltree;
begin
  if new.parent_id is null then
    new.path := replace(new.id::text, '-', '_')::ltree;
  else
    select path into parent_path from zones where id = new.parent_id;
    if parent_path is null then
      raise exception 'Parent zone % not found or has no path', new.parent_id;
    end if;
    new.path := parent_path || replace(new.id::text, '-', '_')::ltree;
  end if;
  return new;
end;
$$;

create or replace function zones_update_path()
returns trigger
language plpgsql
as $$
declare
  old_path ltree;
  new_parent_path ltree;
  new_own_path ltree;
begin
  if new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  old_path := old.path;

  if new.parent_id is null then
    new_own_path := replace(new.id::text, '-', '_')::ltree;
  else
    select path into new_parent_path from zones where id = new.parent_id;
    if new_parent_path is null then
      raise exception 'Parent zone % not found or has no path', new.parent_id;
    end if;
    if new_parent_path <@ old_path then
      raise exception 'Cannot move a zone under its own descendant';
    end if;
    new_own_path := new_parent_path || replace(new.id::text, '-', '_')::ltree;
  end if;

  new.path := new_own_path;

  -- ย้าย subtree ทั้งหมดตามไปด้วย (ลูกหลานทุกระดับ ไม่ใช่แค่ตัวเอง)
  update zones
  set path = new_own_path || subpath(path, nlevel(old_path))
  where path <@ old_path and id <> new.id;

  return new;
end;
$$;

drop trigger if exists trg_zones_set_path on zones;
create trigger trg_zones_set_path
  before insert on zones
  for each row execute function zones_set_path();

drop trigger if exists trg_zones_update_path on zones;
create trigger trg_zones_update_path
  before update on zones
  for each row execute function zones_update_path();

-- ------------------------------------------------------------
-- 3) NEW: enforce parent belongs to the same shop
--
-- Gap found tonight: RLS on zones only checks NEW.shop_id via is_shop_member —
-- it never validates that NEW.parent_id (when set) actually points at a zone
-- row owned by the same shop. A row satisfying "shop_id = my shop" could still
-- carry a parent_id borrowed from another shop's zone tree, which would leak
-- that other shop's zone id/code into this shop's breadcrumb and let
-- `path <@ ...` queries cross shop boundaries. This is exactly the
-- "Multi-tenant: parent_id ข้ามร้าน → reject" test scenario the card itself
-- lists — it was not actually enforced anywhere before this trigger.
-- ------------------------------------------------------------
create or replace function zones_validate_parent_shop()
returns trigger
language plpgsql
as $$
declare
  parent_shop_id bigint;
begin
  if new.parent_id is not null then
    select shop_id into parent_shop_id from zones where id = new.parent_id;
    if parent_shop_id is null then
      raise exception 'Parent zone % not found', new.parent_id;
    end if;
    if parent_shop_id is distinct from new.shop_id then
      raise exception 'Parent zone belongs to a different shop';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zones_validate_parent_shop on zones;
create trigger trg_zones_validate_parent_shop
  before insert or update on zones
  for each row execute function zones_validate_parent_shop();

-- ------------------------------------------------------------
-- 4) Data migration: legacy parts.zone_code (flat text) → parts.zone_id
--
-- Card decision (18/19 ก.ค. 2026): match ที่หาไม่เจอ "โอเค" แต่ต้องมีรายงาน
-- แยกให้เจ้าของร้านไปแก้เอง. Idempotent (only touches rows where zone_id is
-- still null and zone_code is set), safe to run repeatedly, never deletes data.
--
-- Match rule: zone_code ตรงกับ leaf zone code ตัวเดียว ไม่ซ้ำกัน (ภายใน shop
-- เดียวกัน) — ถ้า code ซ้ำกันหลาย leaf (คนละ Area ใช้ code เดียวกันได้ตาม
-- decision ข้อ 4 ของการ์ด) ถือว่า "ไม่สามารถเดาได้อัตโนมัติ" เข้ารายงานตกค้าง
-- แทนที่จะเดาสุ่มเอา zone แรกที่เจอ.
-- ------------------------------------------------------------
do $$
declare
  v_matched integer;
begin
  with candidates as (
    select p.id as part_id, z.id as zone_id, count(*) over (partition by p.id) as match_count
    from parts p
    join zones z
      on z.shop_id = p.shop_id
     and z.code = p.zone_code
     and not exists (select 1 from zones c where c.parent_id = z.id) -- leaf only
    where p.zone_id is null and p.zone_code is not null
  )
  update parts p
  set zone_id = c.zone_id
  from candidates c
  where p.id = c.part_id and c.match_count = 1;

  get diagnostics v_matched = row_count;
  raise notice 'zone_code -> zone_id backfill: % row(s) matched and updated', v_matched;
end $$;

-- รายงานตกค้าง — อะไหล่ที่ยังไม่มี zone_id หลัง backfill ทั้งที่มี zone_code เดิม
-- (ไม่ match เลย, หรือ code ซ้ำกันหลาย leaf จน auto-match ไม่ได้) — เจ้าของร้าน
-- ต้องเข้าไปเลือก zone ให้ตรงเองผ่าน /edit/[id] ทีละชิ้น
-- Run manually after this migration to get the punch list:
--
-- select p.id, p.part_name, p.zone_code, p.shop_id
-- from parts p
-- where p.zone_id is null and p.zone_code is not null
-- order by p.shop_id, p.zone_code;

-- ------------------------------------------------------------
-- Verification queries (run manually after applying):
--   -- row counts unchanged before/after (no data loss):
--   select count(*) from parts;
--   -- everything with a zone_code either got matched or is in the report above:
--   select count(*) from parts where zone_code is not null and zone_id is null;
--   -- path sanity: every zone with a parent has a path that starts with the
--   -- parent's path:
--   select z.id from zones z join zones p on p.id = z.parent_id
--   where not (z.path <@ p.path) or z.path = p.path;  -- should return 0 rows
-- ------------------------------------------------------------
