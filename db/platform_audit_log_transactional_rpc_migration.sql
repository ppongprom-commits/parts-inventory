-- ============================================================
-- Platform admin audit log — transactional write (RPC-based)
--
-- Card: "Platform admin audit log — บันทึกทุกการกระทำที่กระทบลูกค้า"
-- (Priority: Highest, In progress)
--
-- ✅ ตัดสินใจแล้ว (19 ก.ค. 2026, ยืนยันอีกครั้งในการ์ด): เลือก A — block การกระทำหลักถ้าเขียน
-- log ไม่สำเร็จ ต้องทำในทรานแซคชันเดียวกัน — ไฟล์นี้ทำผ่าน RPC (Postgres function) ที่ทำทั้ง
-- mutation หลัก + insert เข้า platform_audit_log ในฟังก์ชันเดียว (Postgres รันทั้งฟังก์ชันเป็น
-- ทรานแซคชันเดียวโดยธรรมชาติ — ถ้า statement ไหนใน้ fail ทั้งฟังก์ชัน rollback หมด ไม่ต้องเขียน
-- application-level transaction handling เพิ่ม)
-- ============================================================

create or replace function platform_update_shop_subscription(
  p_admin_user_id       uuid,
  p_admin_role          text,
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
  v_old shops;
  v_new shops;
begin
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
  values (p_admin_user_id, p_admin_role, 'update_shop_subscription', 'success', p_shop_id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_join_as_support(
  p_admin_user_id uuid,
  p_admin_role    text,
  p_shop_id       bigint
) returns shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new shop_members;
begin
  insert into shop_members (shop_id, user_id, role, status, invited_by, contact_name)
  values (p_shop_id, p_admin_user_id, 'manager', 'active', p_admin_user_id, 'Platform Support')
  on conflict (shop_id, user_id) do update set status = 'active', role = 'manager'
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, new_data)
  values (p_admin_user_id, p_admin_role, 'join_as_support', 'success', p_shop_id, to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_add_admin(
  p_actor_user_id  uuid,
  p_actor_role     text,
  p_target_user_id uuid,
  p_role           text
) returns platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new platform_admins;
begin
  insert into platform_admins (user_id, role) values (p_target_user_id, p_role)
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_user_id, new_data)
  values (p_actor_user_id, p_actor_role, 'add_platform_admin', 'success', p_target_user_id, to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_change_admin_role(
  p_actor_user_id  uuid,
  p_actor_role     text,
  p_target_user_id uuid,
  p_new_role       text
) returns platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old platform_admins;
  v_new platform_admins;
  v_super_admin_count int;
begin
  select * into v_old from platform_admins where user_id = p_target_user_id for update;
  if v_old is null then
    raise exception 'ไม่พบ platform admin user_id=%', p_target_user_id;
  end if;

  -- กัน super_admin คนสุดท้าย demote ตัวเอง/ถูก demote (redundant กับเช็คระดับ API — defense in depth)
  if p_new_role <> 'super_admin' and v_old.role = 'super_admin' then
    select count(*) into v_super_admin_count from platform_admins where role = 'super_admin';
    if v_super_admin_count <= 1 then
      raise exception 'ไม่สามารถลดสิทธิ์ Super Admin คนสุดท้ายได้';
    end if;
  end if;

  update platform_admins set role = p_new_role where user_id = p_target_user_id
  returning * into v_new;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_user_id, old_data, new_data)
  values (p_actor_user_id, p_actor_role, 'change_platform_admin_role', 'success', p_target_user_id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

create or replace function platform_remove_admin(
  p_actor_user_id  uuid,
  p_actor_role     text,
  p_target_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old platform_admins;
  v_super_admin_count int;
begin
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
  values (p_actor_user_id, p_actor_role, 'remove_platform_admin', 'success', p_target_user_id, to_jsonb(v_old));
end;
$$;

-- Append-only invariant: ไม่มี grant update/delete บน platform_audit_log ให้ anon/authenticated
-- เลย (ไม่มี policy ใดๆ ทั้งสิ้น เข้าถึงได้เฉพาะผ่าน service role key ที่ใช้ตอนรัน RPC เหล่านี้
-- เท่านั้น) แม้แต่ super_admin เองก็ไม่มีทางแก้/ลบแถว log ผ่าน client ได้

grant execute on function platform_update_shop_subscription(uuid, text, bigint, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function platform_join_as_support(uuid, text, bigint) to authenticated;
grant execute on function platform_add_admin(uuid, text, uuid, text) to authenticated;
grant execute on function platform_change_admin_role(uuid, text, uuid, text) to authenticated;
grant execute on function platform_remove_admin(uuid, text, uuid) to authenticated;
