-- ============================================================
-- Card: "Multi-branch support" — write-path fix (found via full regression
-- sweep after the initial migration, 24 ก.ค. 2026)
--
-- multi_branch_support_migration.sql made jobs.branch_id/visibility_groups.branch_id
-- NOT NULL and left parts.branch_id/zones.branch_id nullable. Running the full
-- qa-automation regression sweep (job-creation-*.spec.js, job-type-bundle-rbac.spec.js,
-- job-parts-used.spec.js, etc.) immediately surfaced that several existing write
-- paths never set branch_id at all:
--   - create_job_atomic() / create_job_with_visibility_groups() RPCs (used by every
--     job-creation flow in the app) -> every single job creation started failing
--     with a NOT NULL violation, for single-branch shops too (the vast majority).
--   - app/admin/groups/page.js inserts visibility_groups with no branch_id at all
--     (same NOT NULL failure, same blast radius).
--   - sell_salvage_vehicle_scrap() RPC inserts a parts row (branch_id nullable there,
--     so this didn't hard-fail, but silently left new salvage-scrap parts unscoped).
--
-- Fix: a generic BEFORE INSERT trigger that auto-fills branch_id whenever the
-- inserting statement didn't set it — preferring the inserting user's own
-- (unambiguous) branch in that shop, falling back to the shop's default branch.
-- Applied to jobs/visibility_groups (NOT NULL, must always resolve) and
-- parts/zones (nullable, best-effort — closes the scoping gap for every existing
-- app/RPC call site without having to hunt down and edit each one individually).
-- Also fixes the two job-creation RPCs and the salvage-scrap RPC directly (belt +
-- suspenders — the trigger alone would have been enough, but these RPCs are also
-- where a caller-specific branch_id should ideally come from a request parameter
-- once the UI is extended to pass one explicitly for multi-branch shops).
--
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS throughout.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Generic autofill trigger function
-- ------------------------------------------------------------
create or replace function trg_autofill_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id bigint;
begin
  if new.branch_id is not null then
    return new;
  end if;

  select sm.branch_id into v_branch_id
  from shop_members sm
  where sm.shop_id = new.shop_id and sm.user_id = auth.uid() and sm.status = 'active'
  limit 1;

  if v_branch_id is null then
    select b.branch_id into v_branch_id from branches b where b.shop_id = new.shop_id and b.is_default = true;
  end if;

  new.branch_id := v_branch_id;
  return new;
end;
$$;

drop trigger if exists trg_jobs_autofill_branch on jobs;
create trigger trg_jobs_autofill_branch
  before insert on jobs
  for each row
  execute function trg_autofill_branch_id();

drop trigger if exists trg_visibility_groups_autofill_branch on visibility_groups;
create trigger trg_visibility_groups_autofill_branch
  before insert on visibility_groups
  for each row
  execute function trg_autofill_branch_id();

drop trigger if exists trg_parts_autofill_branch on parts;
create trigger trg_parts_autofill_branch
  before insert on parts
  for each row
  when (new.shop_id is not null)
  execute function trg_autofill_branch_id();

drop trigger if exists trg_zones_autofill_branch on zones;
create trigger trg_zones_autofill_branch
  before insert on zones
  for each row
  when (new.shop_id is not null)
  execute function trg_autofill_branch_id();

-- ------------------------------------------------------------
-- 2) create_job_atomic — drop the pre-migration 19-arg overload (adding a new
--    trailing default-valued parameter created a second overload instead of
--    replacing it; PostgREST/postgres would keep resolving old positional calls
--    to the stale overload with no branch_id logic at all otherwise).
-- ------------------------------------------------------------
drop function if exists create_job_atomic(
  bigint, bigint, text, text, text, text, text, text, bigint, bigint, text, text, text,
  text[], jsonb, text, uuid, bigint[], jsonb
);

create or replace function create_job_atomic(
  p_shop_id bigint, p_customer_id bigint, p_customer_name text, p_customer_phone text,
  p_customer_address text, p_car_brand text, p_car_model text, p_car_year_display text,
  p_generation_id bigint, p_trim_id bigint, p_license_plate text, p_source_type text,
  p_notes text, p_photo_urls text[], p_damage_points jsonb, p_car_diagram_type text,
  p_created_by uuid, p_group_ids bigint[] default '{}'::bigint[], p_workflow_steps jsonb default '[]'::jsonb,
  p_branch_id bigint default null
)
returns jobs
language plpgsql
as $$
declare
  v_job jobs;
  v_group_id bigint;
  v_step jsonb;
  v_step_order int := 0;
  v_branch_id bigint;
begin
  v_branch_id := p_branch_id;
  if v_branch_id is null then
    select sm.branch_id into v_branch_id
    from shop_members sm
    where sm.shop_id = p_shop_id and sm.user_id = p_created_by and sm.status = 'active'
    limit 1;
  end if;
  if v_branch_id is null then
    select b.branch_id into v_branch_id from branches b where b.shop_id = p_shop_id and b.is_default = true;
  end if;

  insert into jobs (
    shop_id, customer_id, customer_name, customer_phone, customer_address,
    car_brand, car_model, car_year_display, generation_id, trim_id,
    license_plate, source_type, notes, photo_urls, damage_points,
    car_diagram_type, status, created_by, branch_id
  ) values (
    p_shop_id, p_customer_id, p_customer_name, p_customer_phone, p_customer_address,
    p_car_brand, p_car_model, p_car_year_display, p_generation_id, p_trim_id,
    p_license_plate, p_source_type, p_notes, p_photo_urls, coalesce(p_damage_points, '[]'::jsonb),
    coalesce(p_car_diagram_type, 'sedan'), 'received', p_created_by, v_branch_id
  )
  returning * into v_job;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    foreach v_group_id in array p_group_ids loop
      insert into job_visibility_groups (job_id, group_id) values (v_job.job_id, v_group_id);
    end loop;
  end if;

  if p_workflow_steps is not null and jsonb_array_length(p_workflow_steps) > 0 then
    for v_step in select * from jsonb_array_elements(p_workflow_steps) loop
      insert into job_workflow_steps (job_id, shop_id, step_order, step_name, assigned_to)
      values (
        v_job.job_id,
        p_shop_id,
        v_step_order,
        v_step->>'step_name',
        nullif(v_step->>'assigned_to', '')::uuid
      );
      v_step_order := v_step_order + 1;
    end loop;
  end if;

  return v_job;
end;
$$;

-- ------------------------------------------------------------
-- 3) create_job_with_visibility_groups — same signature as before (no new
--    overload risk), resolves branch_id from p_job->>'branch_id' if the caller
--    starts passing it, else falls back the same way.
-- ------------------------------------------------------------
create or replace function create_job_with_visibility_groups(
  p_job jsonb, p_group_ids bigint[] default null::bigint[], p_client_token uuid default null::uuid,
  p_photo_urls text[] default null::text[], p_damage_points jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
as $$
declare
  v_job_id   bigint;
  v_shop_id  bigint := (p_job->>'shop_id')::bigint;
  v_missing  bigint;
  v_branch_id bigint;
begin
  if v_shop_id is null then
    raise exception 'shop_id is required';
  end if;

  if p_client_token is not null then
    select job_id into v_job_id
    from public.jobs
    where shop_id = v_shop_id and client_token = p_client_token;
    if v_job_id is not null then
      return v_job_id;
    end if;
  end if;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    select gid.id into v_missing
    from unnest(p_group_ids) as gid(id)
    left join public.visibility_groups vg
      on vg.group_id = gid.id and vg.shop_id = v_shop_id
    where vg.group_id is null
    limit 1;
    if v_missing is not null then
      raise exception 'visibility group % does not belong to shop %', v_missing, v_shop_id;
    end if;
  end if;

  v_branch_id := nullif(p_job->>'branch_id', '')::bigint;
  if v_branch_id is null then
    select sm.branch_id into v_branch_id
    from shop_members sm
    where sm.shop_id = v_shop_id and sm.user_id = auth.uid() and sm.status = 'active'
    limit 1;
  end if;
  if v_branch_id is null then
    select b.branch_id into v_branch_id from public.branches b where b.shop_id = v_shop_id and b.is_default = true;
  end if;

  insert into public.jobs (
    shop_id, customer_name, customer_phone, car_brand, car_model,
    car_year_display, generation_id, license_plate, source_type,
    customer_id, customer_address, notes, vat_type, car_diagram_type,
    vehicle_purchase_price, photo_urls, damage_points, created_by, client_token, branch_id
  )
  values (
    v_shop_id,
    p_job->>'customer_name',
    p_job->>'customer_phone',
    p_job->>'car_brand',
    p_job->>'car_model',
    p_job->>'car_year_display',
    nullif(p_job->>'generation_id', '')::bigint,
    p_job->>'license_plate',
    p_job->>'source_type',
    nullif(p_job->>'customer_id', '')::bigint,
    p_job->>'customer_address',
    p_job->>'notes',
    coalesce(p_job->>'vat_type', 'none'),
    coalesce(p_job->>'car_diagram_type', 'sedan'),
    nullif(p_job->>'vehicle_purchase_price', '')::numeric,
    p_photo_urls,
    coalesce(p_damage_points, '[]'::jsonb),
    auth.uid(),
    p_client_token,
    v_branch_id
  )
  returning job_id into v_job_id;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    insert into public.job_visibility_groups (job_id, group_id)
    select v_job_id, gid
    from unnest(p_group_ids) as gid;
  end if;

  return v_job_id;
end;
$$;

-- ------------------------------------------------------------
-- 4) sell_salvage_vehicle_scrap — resolve branch_id from the destination zone
--    (physical location of the scrap part), falling back to the shop default.
-- ------------------------------------------------------------
create or replace function sell_salvage_vehicle_scrap(p_vehicle_id bigint)
returns parts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle salvage_vehicles;
  v_caller_role text;
  v_allocated_so_far numeric;
  v_remainder numeric;
  v_new_part parts;
  v_branch_id bigint;
begin
  select * into v_vehicle from salvage_vehicles where vehicle_id = p_vehicle_id for update;
  if v_vehicle is null then
    raise exception 'ไม่พบซากรถ vehicle_id=%', p_vehicle_id;
  end if;

  select role into v_caller_role from shop_members
    where shop_id = v_vehicle.shop_id and user_id = auth.uid() and status = 'active'
    limit 1;
  if v_caller_role is null or v_caller_role not in ('owner', 'manager', 'supervisor') then
    raise exception 'ไม่มีสิทธิ์ขายซากที่เหลือของคันนี้';
  end if;

  if v_vehicle.status in ('fully_disassembled', 'sold_whole') then
    raise exception 'คันนี้ปิดไปแล้ว (status=%) — ขายเศษเหล็กซ้ำไม่ได้', v_vehicle.status;
  end if;

  if v_vehicle.purchase_price is null then
    raise exception 'คันนี้ไม่มี purchase_price บันทึกไว้ — คำนวณเศษเหล็กไม่ได้';
  end if;

  select coalesce(sum(allocated_cost), 0) into v_allocated_so_far
    from parts where salvage_vehicle_id = p_vehicle_id;

  v_remainder := (v_vehicle.purchase_price + coalesce(v_vehicle.labor_cost, 0)) - v_allocated_so_far;
  if v_remainder < 0 then
    v_remainder := 0;
  end if;

  select z.branch_id into v_branch_id from zones z where z.id = v_vehicle.zone_id;
  if v_branch_id is null then
    select b.branch_id into v_branch_id from branches b where b.shop_id = v_vehicle.shop_id and b.is_default = true;
  end if;

  insert into parts (
    shop_id, part_name, car_brand, car_model, generation_id, trim_id,
    condition, source_type, status, quantity, price, item_type,
    zone_id, salvage_vehicle_id, allocated_cost, notes, branch_id
  )
  select
    v_vehicle.shop_id,
    'เศษเหล็ก — ซากรถ #' || v_vehicle.vehicle_id,
    null, null, v_vehicle.generation_id, v_vehicle.trim_id,
    'scrap', 'salvage', 'available', 1, null, 'salvage',
    v_vehicle.zone_id, p_vehicle_id, v_remainder,
    'สร้างอัตโนมัติตอนขายซากที่เหลือ (sell_salvage_vehicle_scrap) — allocated_cost = (purchase_price + labor_cost) - Σ allocated_cost ของอะไหล่จริงที่ถอดไปแล้ว',
    v_branch_id
  returning * into v_new_part;

  update salvage_vehicles set status = 'fully_disassembled' where vehicle_id = p_vehicle_id;

  return v_new_part;
end;
$$;
