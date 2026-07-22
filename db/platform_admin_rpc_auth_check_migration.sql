-- ============================================================
-- Fix: platform_* RPC functions trusted the caller-supplied actor id/role
-- purely for logging, with ZERO server-side verification that the caller
-- actually holds that privilege — privilege escalation (anyone able to
-- reach the RPC endpoint directly, e.g. via /rest/v1/rpc/..., could pass
-- any user_id/role and act as super_admin).
--
-- Card: "🔴 P0: platform_change_admin_role / platform_add_admin /
-- platform_remove_admin — ไม่มี auth check เลย (privilege escalation ทั้งแพลตฟอร์ม)"
--
-- ขยายขอบเขตเพิ่มจากการ์ดเดิม (พบระหว่างตรวจสอบ 22 ก.ค. 2026):
-- platform_join_as_support และ platform_update_shop_subscription มีรูปแบบช่องโหว่
-- เดียวกันทุกประการ และ (ต่างจาก 3 ฟังก์ชันแรก) ยังไม่เคยถูก revoke execute จาก
-- anon/authenticated/PUBLIC เป็นมาตรการฉุกเฉินเลย — คือช่องโหว่ที่ยัง exploit ได้จริง
-- ณ ตอนตรวจ จึงแก้พร้อมกันทั้ง 5 ฟังก์ชันเพื่อปิดช่องโหว่ทั้งคลาสให้ครบ ไม่ใช่แค่ 3 ตัว
-- ที่ระบุไว้ในการ์ด
--
-- แนวทางแก้ (ปรับจาก draft ในการ์ดให้เข้ากับสถาปัตยกรรมจริง — ดูหมายเหตุด้านล่าง):
-- ฟังก์ชัน lookup role จริงของ p_actor_user_id จากตาราง platform_admins เอง แล้ว
-- ใช้ค่านั้นตัดสินสิทธิ์ + บันทึกลง audit log เท่านั้น (เลิกรับพารามิเตอร์ role จาก
-- ผู้เรียก — ตัดออกจาก signature ทั้งหมด) เพิ่มเช็ค auth.uid() คู่เป็น defense-in-depth
--
-- หมายเหตุสำคัญ — ทำไมไม่ใช้ auth.uid() เป็นตัวตัดสินสิทธิ์เพียงอย่างเดียวตรงๆ ตามที่
-- ร่างไว้ในการ์ด: แอปจริง (app/api/platform/**\/route.js) เรียก RPC เหล่านี้ผ่าน
-- `supabaseAdmin` (service_role key) เสมอ ซึ่ง JWT ของ service_role ไม่มี claim `sub`
-- ของผู้ใช้จริง (auth.uid() จะเป็น NULL) — ถ้าบังคับ auth.uid() ต้องตรงกับ super_admin
-- เพียงอย่างเดียว จะพังฟีเจอร์ platform-admin panel ทั้งหมดทันที (ตัว requirePlatformRole()
-- ใน route.js เป็นชั้นที่ verify ตัวตนจริงจาก Authorization Bearer token อยู่แล้วก่อนเรียก RPC)
-- จึงออกแบบเป็น 2 ชั้นแทน: (1) ชั้นหลัก — lookup role จริงจาก DB ด้วย p_actor_user_id
-- ที่ route.js ส่งมา (ค่านี้ผ่านการ verify จริงจาก session แล้วที่ชั้น API) (2) ชั้นเสริม —
-- ถ้ามี auth.uid() จริง (กรณี grant หลุดไปเปิดให้ anon/authenticated เรียกตรงในอนาคต โดย
-- ไม่ได้ตั้งใจ — เคยเกิดปัญหานี้มาแล้ว 2 ครั้งกับ views อื่น) ต้องตรงกับ p_actor_user_id
-- ด้วย ไม่งั้น reject ทันที — ปิดช่องทางที่ผู้ใช้ authenticated ทั่วไปแอบอ้าง user_id คนอื่น
--
-- บั๊กแยกที่พบระหว่างตรวจสอบ (22 ก.ค. 2026, ไม่เกี่ยวกับช่องโหว่ security แต่แก้พร้อมกัน
-- เพราะเจอตอนทดสอบฟังก์ชันชุดนี้พอดี): platform_audit_log.action มี CHECK constraint
-- อนุญาตแค่ ('subscription_edit','join_as_support','admin_added','admin_removed',
-- 'admin_role_changed') แต่ฟังก์ชันเดิม (ก่อนแก้ไฟล์นี้) insert action เป็น
-- 'add_platform_admin'/'change_platform_admin_role'/'remove_platform_admin'/
-- 'update_shop_subscription' ซึ่งไม่ตรงกับ constraint เลยสักตัว (ยกเว้น join_as_support) —
-- แปลว่า add/change-role/remove admin และ update subscription ทุกครั้งที่เคยเรียกจริงผ่าน
-- แอปจะ insert audit log ไม่ผ่าน CHECK constraint แล้วทั้งฟังก์ชัน rollback (error 500 ให้
-- ผู้ใช้ทันที) มาโดยตลอด — แก้ให้ใช้ action string ที่ตรงกับ constraint จริงในไฟล์นี้ด้วย
--
-- Defense เพิ่มอีกชั้น (สำคัญที่สุด ปิดช่องโหว่หลักได้จริงแม้ฟังก์ชันข้างในจะพลาด):
-- revoke execute จาก anon/authenticated/PUBLIC แบบถาวร เหลือแค่ service_role/postgres
-- เรียกได้ (ทำเป็น migration แทนการ revoke มือเฉพาะหน้าบน staging เมื่อ 22 ก.ค. — กัน
-- migration ในอนาคต GRANT ALL คืนโดยไม่ตั้งใจแล้วช่องโหว่กลับมาเงียบๆ)
-- ============================================================

-- ต้อง DROP ก่อน เพราะเปลี่ยน parameter list (ตัด p_actor_role/p_admin_role ออก) —
-- "create or replace" จะไม่แทนที่ฟังก์ชัน signature เดิม แต่จะสร้าง overload ใหม่คู่กัน
-- ทำให้ฟังก์ชันช่องโหว่เดิมยังเรียกได้อยู่ ต้อง drop signature เดิมทิ้งให้ชัดเจน
-- หมายเหตุเพิ่ม (พบระหว่าง apply บน staging 22 ก.ค. 2026): platform_join_as_support
-- มี overload เก่าตกค้างอยู่ 2 แบบ — (uuid, bigint) ที่ไม่มีใครเรียกใช้จริงในโค้ด (dead code
-- จาก session ก่อนหน้า) และ (uuid, text, bigint) ที่ route.js เรียกใช้จริงปัจจุบัน — ทั้งคู่ไม่
-- เช็คสิทธิ์อะไรเลยเหมือนกัน ต้อง drop ทิ้งทั้ง 2 signature ก่อนสร้างเวอร์ชันปลอดภัยใหม่
drop function if exists platform_add_admin(uuid, text, uuid, text);
drop function if exists platform_change_admin_role(uuid, text, uuid, text);
drop function if exists platform_remove_admin(uuid, text, uuid);
drop function if exists platform_join_as_support(uuid, bigint);
drop function if exists platform_join_as_support(uuid, text, bigint);
drop function if exists platform_update_shop_subscription(uuid, text, bigint, text, text, timestamptz, timestamptz);

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

-- Permission matrix (การ์ด "Platform admin role tiers"): join-as-support อนุญาต
-- super_admin + support เท่านั้น (analyst ห้าม)
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

-- Permission matrix: แก้ subscription/billing — super_admin เท่านั้น
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

-- ปิดช่องโหว่หลักแบบถาวร: เหลือแค่ postgres/service_role เรียกได้ (แอปจริงเรียกผ่าน
-- supabaseAdmin เท่านั้นอยู่แล้ว ไม่กระทบ flow ปกติ) — ทำเป็น migration กัน GRANT ALL
-- ย้อนกลับมาโดยไม่ตั้งใจในอนาคต
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
