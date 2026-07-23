-- ============================================================
-- พอร์ตระบบ Platform Admin role tiers + platform_audit_log มาที่ production
-- (Supabase project ktfnnmxrochfcjzifjlw — คนละโปรเจกต์กับ staging qmqabtrrubqcmafietsr)
--
-- ที่มา: ระบบเดียวกันนี้ทำงานอยู่แล้วบน staging มาจาก 2 ไฟล์:
--   db/platform_admin_role_tiers_and_audit_log_migration.sql
--   db/platform_admin_rpc_auth_check_migration.sql (P0 security fix)
-- production ไม่เคย deploy RPC เวอร์ชันเก่าที่มีช่องโหว่เลย (ตรวจแล้วว่าไม่มีฟังก์ชัน platform_*
-- อยู่บน production มาก่อนสักตัว) จึงสร้างตรงเป็นเวอร์ชันปลอดภัยสุดท้ายไปเลย ไม่ต้อง replay
-- ประวัติที่มีช่องโหว่ระหว่างทาง
--
-- ยืนยันแล้วว่า ppongprom@gmail.com เป็น platform admin คนเดียวที่มีอยู่แล้วบน production
-- (เหมือนกับที่เป็น super_admin บน staging) — ตั้งเป็น super_admin ให้ตรงกัน
-- ============================================================

-- ------------------------------------------------------------
-- 1) platform_admins.role
-- ------------------------------------------------------------
alter table platform_admins add column if not exists role text default 'support';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'platform_admins_role_check'
  ) then
    alter table platform_admins
      add constraint platform_admins_role_check
      check (role in ('super_admin', 'support', 'analyst'));
  end if;
end $$;

update platform_admins
set role = 'super_admin'
where user_id = (select id from auth.users where email = 'ppongprom@gmail.com')
  and role is distinct from 'super_admin';

-- ------------------------------------------------------------
-- 2) platform_audit_log — แยกจาก audit_log ของร้านโดยสิ้นเชิง
-- ------------------------------------------------------------
create table if not exists platform_audit_log (
  audit_id        bigint generated always as identity primary key,
  admin_user_id   uuid not null,
  admin_role      text,
  action          text not null,
  status          text not null default 'success' check (status in ('success', 'failed')),
  target_shop_id  bigint,
  target_user_id  uuid,
  old_data        jsonb,
  new_data        jsonb,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_platform_audit_log_admin on platform_audit_log (admin_user_id);
create index if not exists idx_platform_audit_log_shop on platform_audit_log (target_shop_id);
create index if not exists idx_platform_audit_log_created_at on platform_audit_log (created_at);

alter table platform_audit_log enable row level security;
-- ไม่สร้าง policy ใดๆ ทั้งสิ้น เหมือน platform_admins — เข้าถึงได้เฉพาะผ่าน service role key

-- ------------------------------------------------------------
-- 3) RPC ทั้ง 5 ตัว — เวอร์ชันปลอดภัยสุดท้าย (lookup role จริงจาก platform_admins ด้วย
-- p_actor_user_id เสมอ ไม่เชื่อ role ที่ผู้เรียกอ้างมา + defense-in-depth เช็ค auth.uid())
-- ------------------------------------------------------------
create or replace function platform_add_admin(
  p_actor_user_id  uuid,
  p_target_user_id uuid,
  p_role           text
) returns platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_new platform_admins;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์จัดการ platform admin';
  end if;

  insert into platform_admins (user_id, role) values (p_target_user_id, p_role)
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_user_id, new_data)
  values (p_actor_user_id, v_actor_role, 'admin_added', 'success', p_target_user_id, to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_change_admin_role(
  p_actor_user_id  uuid,
  p_target_user_id uuid,
  p_new_role       text
) returns platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_old platform_admins;
  v_new platform_admins;
  v_super_admin_count int;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์จัดการ platform admin';
  end if;

  select * into v_old from platform_admins where user_id = p_target_user_id for update;
  if v_old is null then
    raise exception 'ไม่พบ platform admin user_id=%', p_target_user_id;
  end if;

  if p_new_role <> 'super_admin' and v_old.role = 'super_admin' then
    select count(*) into v_super_admin_count from platform_admins where role = 'super_admin';
    if v_super_admin_count <= 1 then
      raise exception 'ไม่สามารถลดสิทธิ์ Super Admin คนสุดท้ายได้';
    end if;
  end if;

  update platform_admins set role = p_new_role where user_id = p_target_user_id
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_user_id, old_data, new_data)
  values (p_actor_user_id, v_actor_role, 'admin_role_changed', 'success', p_target_user_id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_remove_admin(
  p_actor_user_id  uuid,
  p_target_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_old platform_admins;
  v_super_admin_count int;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์จัดการ platform admin';
  end if;

  select * into v_old from platform_admins where user_id = p_target_user_id for update;
  if v_old is null then
    raise exception 'ไม่พบ platform admin user_id=%', p_target_user_id;
  end if;

  if v_old.role = 'super_admin' then
    select count(*) into v_super_admin_count from platform_admins where role = 'super_admin';
    if v_super_admin_count <= 1 then
      raise exception 'ไม่สามารถลบ Super Admin คนสุดท้ายได้';
    end if;
  end if;

  delete from platform_admins where user_id = p_target_user_id;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_user_id, old_data)
  values (p_actor_user_id, v_actor_role, 'admin_removed', 'success', p_target_user_id, to_jsonb(v_old));
end;
$$;

create or replace function platform_join_as_support(
  p_actor_user_id uuid,
  p_shop_id       bigint
) returns shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_new shop_members;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role not in ('super_admin', 'support') then
    raise exception 'ไม่มีสิทธิ์ join-as-support';
  end if;

  insert into shop_members (shop_id, user_id, role, status, invited_by, contact_name)
  values (p_shop_id, p_actor_user_id, 'manager', 'active', p_actor_user_id, 'Platform Support')
  on conflict (shop_id, user_id) do update set status = 'active', role = 'manager'
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, new_data)
  values (p_actor_user_id, v_actor_role, 'join_as_support', 'success', p_shop_id, to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_update_shop_subscription(
  p_actor_user_id       uuid,
  p_shop_id             bigint,
  p_subscription_status text,
  p_subscription_plan   text,
  p_trial_ends_at       timestamptz,
  p_current_period_end  timestamptz
) returns shops
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_old shops;
  v_new shops;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์แก้ subscription/billing';
  end if;

  select * into v_old from shops where shop_id = p_shop_id for update;
  if v_old is null then
    raise exception 'ไม่พบอู่ shop_id=%', p_shop_id;
  end if;

  update shops set
    subscription_status = coalesce(p_subscription_status, subscription_status),
    subscription_plan   = coalesce(p_subscription_plan, subscription_plan),
    trial_ends_at       = p_trial_ends_at,
    current_period_end  = p_current_period_end,
    suspended_at        = case when p_subscription_status = 'suspended' then now() else suspended_at end,
    canceled_at         = case when p_subscription_status = 'canceled' then now() else canceled_at end,
    past_due_since      = case when p_subscription_status = 'past_due' then now() else past_due_since end
  where shop_id = p_shop_id
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, old_data, new_data)
  values (p_actor_user_id, v_actor_role, 'subscription_edit', 'success', p_shop_id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

-- เหลือแค่ postgres/service_role เรียกได้ (แอปจริงเรียกผ่าน supabaseAdmin เท่านั้นอยู่แล้ว)
revoke execute on function platform_add_admin(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform_change_admin_role(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform_remove_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function platform_join_as_support(uuid, bigint) from public, anon, authenticated;
revoke execute on function platform_update_shop_subscription(uuid, bigint, text, text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function platform_add_admin(uuid, uuid, text) to service_role;
grant execute on function platform_change_admin_role(uuid, uuid, text) to service_role;
grant execute on function platform_remove_admin(uuid, uuid) to service_role;
grant execute on function platform_join_as_support(uuid, bigint) to service_role;
grant execute on function platform_update_shop_subscription(uuid, bigint, text, text, timestamptz, timestamptz) to service_role;

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select role from platform_admins where user_id = (select id from auth.users where email = 'ppongprom@gmail.com');
--   -- ควรได้ 'super_admin'
--   select proname, prosecdef from pg_proc where proname like 'platform_%';
-- ------------------------------------------------------------
