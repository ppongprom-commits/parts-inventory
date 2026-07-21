-- ============================================================
-- Card: "Field Visibility Whitelist กลาง (role × field group) — ตัดสินใจครั้งเดียว ใช้ 4 การ์ด"
-- (Priority: Medium, In progress)
--
-- Scope this run: the default matrix + override table + floor-rule enforcement, wired into ONE
-- of the 4 cards this decision serves (Export CSV — parts), since it's the only one with real
-- code already shipped tonight. Custom Report Builder and API พื้นฐาน are both still "Not
-- started" — there's no code to wire the matrix into yet. Field Scanner Role's price-hiding
-- already uses config/rolePermissions.js (view_price), which agrees with this matrix but wasn't
-- migrated to read from it tonight, to limit blast radius on heavily-regression-tested code.
--
-- The floor rules themselves (config/fieldVisibility.js FLOOR_RULES) are enforced in application
-- code (canSeeField() always checks floor before checking any override) — this migration ALSO
-- enforces them at the DB layer via a CHECK-like trigger, so a direct SQL edit to this table can't
-- silently violate a floor rule either (defense in depth, matching this project's general pattern
-- of RLS as a backstop below the app layer).
-- ============================================================

create table if not exists shop_field_visibility_overrides (
  id           bigint generated always as identity primary key,
  shop_id      bigint not null references shops(shop_id),
  role         text not null check (role in ('owner', 'manager', 'supervisor', 'technician', 'assistant', 'field_scanner')),
  field_group  text not null check (field_group in (
    'sale_price', 'cost_price', 'customer_name', 'customer_phone', 'license_plate',
    'sales_reports', 'export_csv_parts', 'export_csv_jobs', 'manage_api_keys'
  )),
  allowed      boolean not null,
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  unique (shop_id, role, field_group)
);

create index if not exists idx_shop_field_visibility_overrides_shop on shop_field_visibility_overrides (shop_id);

alter table shop_field_visibility_overrides enable row level security;

drop policy if exists "shop members can view field visibility overrides" on shop_field_visibility_overrides;
create policy "shop members can view field visibility overrides" on shop_field_visibility_overrides
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

drop policy if exists "owner can manage field visibility overrides" on shop_field_visibility_overrides;
create policy "owner can manage field visibility overrides" on shop_field_visibility_overrides
  for all using (is_shop_member(shop_id, array['owner']))
  with check (is_shop_member(shop_id, array['owner']));

-- ------------------------------------------------------------
-- Floor rule enforcement at the DB layer — must match config/fieldVisibility.js FLOOR_RULES
-- exactly, or the two will silently disagree (same duplication trade-off documented on the Stock
-- Value Cap Engine migration tonight — the alternative of round-tripping through an RPC on every
-- single write here is not worth it for a rarely-written settings table, unlike that one).
-- ------------------------------------------------------------
create or replace function fn_enforce_field_visibility_floor()
returns trigger
language plpgsql
as $$
begin
  if new.allowed = true then
    if (new.role, new.field_group) in (
      ('field_scanner', 'customer_name'),
      ('field_scanner', 'customer_phone'),
      ('supervisor', 'manage_api_keys'),
      ('technician', 'manage_api_keys'),
      ('assistant', 'manage_api_keys'),
      ('field_scanner', 'manage_api_keys')
    ) then
      raise exception 'Cannot override % for role % above the floor (allowed=false is required)', new.field_group, new.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_field_visibility_floor on shop_field_visibility_overrides;
create trigger trg_enforce_field_visibility_floor
  before insert or update on shop_field_visibility_overrides
  for each row execute function fn_enforce_field_visibility_floor();

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   -- this should raise the floor-rule exception:
--   insert into shop_field_visibility_overrides (shop_id, role, field_group, allowed)
--   values (1, 'field_scanner', 'customer_name', true);
-- ------------------------------------------------------------
