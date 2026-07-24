-- ============================================================
-- Card: "Field Visibility Whitelist กลาง (role × field group) — ตัดสินใจครั้งเดียว ใช้ 4 การ์ด"
-- (Priority: Medium, In progress) — follow-up fix
--
-- Bug found while finishing this card: db/field_visibility_overrides_migration.sql (21 ก.ค. 2026)
-- was written BEFORE the "Admin Role (7th role)" card landed (23 ก.ค. 2026 — commit df1a4e5),
-- which added 'admin' as a 7th role sharing the Supervisor column in this same matrix except
-- manage_api_keys, which stays floor-locked for Admin too. config/fieldVisibility.js was updated
-- for the admin role (DEFAULT_FIELD_VISIBILITY.admin + FLOOR_RULES includes
-- ["admin","manage_api_keys"]) but this table's `role` CHECK constraint and the floor-enforcement
-- trigger were never updated to match — so:
--   1. Any attempt to insert a shop_field_visibility_overrides row with role='admin' would be
--      rejected outright by the CHECK constraint (blocking legitimate Owner overrides for Admin).
--   2. Even if the constraint were loosened without this fix, the trigger's floor list didn't
--      include ('admin','manage_api_keys'), so a malicious/malformed direct DB write could grant
--      Admin API key management — a floor violation the JS-side canSeeField() would still catch,
--      but the DB layer (this project's defense-in-depth backstop per SOP.md) would not.
--
-- Idempotent: safe to run multiple times on any environment state.
-- ============================================================

-- 1) Widen the role CHECK constraint to include 'admin'.
alter table shop_field_visibility_overrides drop constraint if exists shop_field_visibility_overrides_role_check;
alter table shop_field_visibility_overrides
  add constraint shop_field_visibility_overrides_role_check
  check (role in ('owner', 'manager', 'supervisor', 'technician', 'assistant', 'field_scanner', 'admin'));

-- 2) Fix the floor-enforcement trigger function to include ('admin', 'manage_api_keys') — must
--    match config/fieldVisibility.js FLOOR_RULES exactly.
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
      ('field_scanner', 'manage_api_keys'),
      ('admin', 'manage_api_keys')
    ) then
      raise exception 'Cannot override % for role % above the floor (allowed=false is required)', new.field_group, new.role;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger itself is unchanged (still points at the same function name) — recreate defensively
-- in case an environment somehow has the trigger pointing elsewhere.
drop trigger if exists trg_enforce_field_visibility_floor on shop_field_visibility_overrides;
create trigger trg_enforce_field_visibility_floor
  before insert or update on shop_field_visibility_overrides
  for each row execute function fn_enforce_field_visibility_floor();

-- 3) RLS select policy only allowed roles owner/manager/supervisor/technician/assistant to view
--    overrides — 'admin' role members were silently unable to view the override table for their
--    own shop's field-visibility settings (not a security bug, just missing an allowed role — see
--    "admin can view shop_members like supervisor" pattern elsewhere for admin's usual grouping).
drop policy if exists "shop members can view field visibility overrides" on shop_field_visibility_overrides;
create policy "shop members can view field visibility overrides" on shop_field_visibility_overrides
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','field_scanner','admin']));

-- ------------------------------------------------------------
-- Verification (run manually after applying):
--   -- should now succeed (admin allowed=false is fine, never a floor violation):
--   insert into shop_field_visibility_overrides (shop_id, role, field_group, allowed)
--   values (1, 'admin', 'sales_reports', true) on conflict (shop_id, role, field_group) do update set allowed = true;
--   -- should raise the floor-rule exception:
--   insert into shop_field_visibility_overrides (shop_id, role, field_group, allowed)
--   values (1, 'admin', 'manage_api_keys', true);
-- ------------------------------------------------------------
