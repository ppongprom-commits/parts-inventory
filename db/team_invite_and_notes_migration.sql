-- ============================================================
-- Migration: Team Invite (real email) + contact info + parts note
-- รันไฟล์นี้ "หลังจาก" db/auth_multi_tenant_schema.sql และ
-- db/fresh_project_full_schema.sql ถูกรันไปแล้วเท่านั้น
-- ใช้ Supabase SQL Editor รันทั้งไฟล์นี้ครั้งเดียว
-- ============================================================

-- ------------------------------------------------------------
-- 1) เพิ่มข้อมูลติดต่อ (ชื่อ-นามสกุล / เบอร์โทร) ให้สมาชิกแต่ละอู่
-- ------------------------------------------------------------
alter table shop_members add column if not exists contact_name  text;
alter table shop_members add column if not exists contact_phone text;

-- ------------------------------------------------------------
-- 2) เพิ่มหมายเหตุ (free text) ให้ parts
-- ------------------------------------------------------------
alter table parts add column if not exists note text;

-- ------------------------------------------------------------
-- 3) create_shop_with_owner: รับชื่อ-นามสกุล/เบอร์โทรของเจ้าของอู่ด้วย
--    ⚠️ ต้อง DROP signature เดิม (1 พารามิเตอร์) ก่อนเสมอ ไม่งั้น Postgres
--    จะมองว่าเป็นคนละฟังก์ชัน (overload) ทำให้แอปเรียก RPC แล้ว error
--    "function is not unique" เพราะเลือกไม่ถูกว่าจะใช้ตัวไหน
-- ------------------------------------------------------------
drop function if exists create_shop_with_owner(text);

create or replace function create_shop_with_owner(
  p_shop_name     text,
  p_contact_name  text default null,
  p_contact_phone text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id bigint;
begin
  insert into shops (shop_name, owner_user_id, subscription_status, subscription_plan, trial_ends_at)
  values (p_shop_name, auth.uid(), 'trialing', 'trial', now() + interval '14 days')
  returning shop_id into v_shop_id;

  insert into shop_members (shop_id, user_id, role, status, contact_name, contact_phone)
  values (v_shop_id, auth.uid(), 'owner', 'active', p_contact_name, p_contact_phone);

  return v_shop_id;
end;
$$;

grant execute on function create_shop_with_owner(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4) get_invite_preview: ให้คนที่เพิ่งกดลิงก์เชิญ (login แล้วผ่าน magic link)
--    ดูชื่ออู่/บทบาทที่ถูกเชิญได้ก่อนกรอกฟอร์ม
--    (เช็คว่าอีเมลของ auth.uid() ตรงกับอีเมลที่ถูกเชิญเท่านั้น)
-- ------------------------------------------------------------
create or replace function get_invite_preview(p_invite_id bigint)
returns table (invite_id bigint, shop_name text, role text, email text, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select auth.users.email into v_email from auth.users where id = auth.uid();

  return query
    select si.invite_id, s.shop_name, si.role, si.email, si.accepted_at
    from shop_invites si
    join shops s on s.shop_id = si.shop_id
    where si.invite_id = p_invite_id
      and lower(si.email) = lower(coalesce(v_email, ''));
end;
$$;

grant execute on function get_invite_preview(bigint) to authenticated;

-- ------------------------------------------------------------
-- 5) accept_shop_invite: รับคำเชิญ "ใบเดียว" ตาม invite_id ที่มากับลิงก์
--    พร้อมบันทึกชื่อ-นามสกุล/เบอร์โทรของคนที่มารับเชิญ
-- ------------------------------------------------------------
create or replace function accept_shop_invite(
  p_invite_id     bigint,
  p_contact_name  text default null,
  p_contact_phone text default null
)
returns shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_invite record;
  v_member shop_members;
begin
  select auth.users.email into v_email from auth.users where id = auth.uid();

  select * into v_invite from shop_invites
  where invite_id = p_invite_id and lower(email) = lower(coalesce(v_email, ''));

  if v_invite is null then
    raise exception 'ไม่พบคำเชิญนี้ หรืออีเมลไม่ตรงกับบัญชีที่ login อยู่';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'คำเชิญนี้ถูกใช้ไปแล้ว';
  end if;

  insert into shop_members (shop_id, user_id, role, status, invited_by, contact_name, contact_phone)
  values (v_invite.shop_id, auth.uid(), v_invite.role, 'active', v_invite.invited_by, p_contact_name, p_contact_phone)
  on conflict (shop_id, user_id) do update
    set status = 'active', role = excluded.role,
        contact_name = excluded.contact_name, contact_phone = excluded.contact_phone
  returning * into v_member;

  update shop_invites set accepted_at = now() where invite_id = p_invite_id;

  return v_member;
end;
$$;

grant execute on function accept_shop_invite(bigint, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6) accept_pending_invites: คงไว้เป็น fallback (เผื่อคน login เอง
--    โดยไม่ผ่านลิงก์เชิญโดยตรง) — เพิ่ม parameter เก็บ contact info ได้
-- ------------------------------------------------------------
create or replace function accept_pending_invites(
  p_contact_name  text default null,
  p_contact_phone text default null
)
returns setof shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
begin
  select email into v_email from auth.users where id = auth.uid();

  for v_invite in
    select * from shop_invites where lower(email) = lower(v_email) and accepted_at is null
  loop
    insert into shop_members (shop_id, user_id, role, status, invited_by, contact_name, contact_phone)
    values (v_invite.shop_id, auth.uid(), v_invite.role, 'active', v_invite.invited_by, p_contact_name, p_contact_phone)
    on conflict (shop_id, user_id) do nothing;

    update shop_invites set accepted_at = now() where invite_id = v_invite.invite_id;
  end loop;

  return query select * from shop_members where user_id = auth.uid();
end;
$$;

grant execute on function accept_pending_invites(text, text) to authenticated;

-- ------------------------------------------------------------
-- 7) delete_shop_invite: ลบคำเชิญที่ยังไม่ตอบรับ (owner/manager เท่านั้น)
--    ใช้ตอนต้องการลบแล้วส่งคำเชิญใหม่ (เช่น พิมพ์อีเมลผิด หรือเปลี่ยนบทบาท)
-- ------------------------------------------------------------
create or replace function delete_shop_invite(p_invite_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_caller_role text;
begin
  select * into v_invite from shop_invites where invite_id = p_invite_id;
  if v_invite is null then
    raise exception 'ไม่พบคำเชิญนี้';
  end if;

  select role into v_caller_role from shop_members
  where shop_id = v_invite.shop_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner','manager') then
    raise exception 'ไม่มีสิทธิ์ลบคำเชิญของอู่นี้';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'คำเชิญนี้ถูกตอบรับไปแล้ว ลบไม่ได้';
  end if;

  delete from shop_invites where invite_id = p_invite_id;
end;
$$;

grant execute on function delete_shop_invite(bigint) to authenticated;

-- ------------------------------------------------------------
-- 8) create_shop_invite: เพิ่มการเช็ค tier limit (maxMembers) ฝั่ง DB
--    รับ p_max_members มาจากแอป (อ่านจาก config/subscriptionTiers.js
--    ซึ่งเป็น single source of truth ฝั่ง JS) แล้วนับ active member +
--    invite ที่ค้างอยู่ เทียบกับ limit นี้ ถ้าเกินให้ raise exception
--    ⚠️ ถ้าไม่ส่ง p_max_members มา (null) จะไม่จำกัด (เผื่อ enterprise)
--
--    ⚠️ ต้อง DROP signature เดิม (3 พารามิเตอร์) ก่อนเสมอ ด้วยเหตุผลเดียวกับ
--    create_shop_with_owner ด้านบน — กัน function overload ชนกัน
-- ------------------------------------------------------------
drop function if exists create_shop_invite(bigint, text, text);

create or replace function create_shop_invite(
  p_shop_id      bigint,
  p_email        text,
  p_role         text,
  p_max_members  integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id bigint;
  v_caller_role text;
  v_current_count integer;
begin
  select role into v_caller_role from shop_members
  where shop_id = p_shop_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner','manager') then
    raise exception 'ไม่มีสิทธิ์เชิญสมาชิกในอู่นี้';
  end if;

  if p_max_members is not null then
    select
      (select count(*) from shop_members where shop_id = p_shop_id and status = 'active')
      +
      (select count(*) from shop_invites where shop_id = p_shop_id and accepted_at is null and lower(email) <> lower(p_email))
    into v_current_count;

    if v_current_count >= p_max_members then
      raise exception 'จำนวนสมาชิก/คำเชิญค้างถึงขีดจำกัดของแพ็กเกจแล้ว (สูงสุด % คน)', p_max_members;
    end if;
  end if;

  insert into shop_invites (shop_id, email, role, invited_by)
  values (p_shop_id, lower(p_email), p_role, auth.uid())
  on conflict (shop_id, email) do update set role = excluded.role, accepted_at = null
  returning invite_id into v_invite_id;

  return v_invite_id;
end;
$$;

grant execute on function create_shop_invite(bigint, text, text, integer) to authenticated;

-- ============================================================
-- หมายเหตุ: ขั้นตอนตั้ง Super Admin (platform_admins) — ดู README
-- หรือรัน SQL ด้านล่างนี้เอง (แทนอีเมลตัวเอง) หลัง signup เสร็จแล้ว:
--
-- insert into platform_admins (user_id)
-- select id from auth.users where email = 'your-email@example.com';
-- ============================================================
