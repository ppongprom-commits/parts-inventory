-- ============================================================
-- Multi-Tenant SaaS Schema: Shops, Members, Roles, Subscriptions
-- ออกแบบไว้สำหรับ implement ต่อ (ยังไม่ apply เข้าฐานข้อมูลจริง)
-- ต้องใช้คู่กับ Supabase Auth (auth.users) — ระบบปัจจุบันยังไม่มี login
-- ============================================================

-- ------------------------------------------------------------
-- 1) shops — 1 แถว = 1 อู่ (tenant)
-- ------------------------------------------------------------
create table shops (
  shop_id             bigint generated always as identity primary key,
  shop_name           text not null,
  owner_user_id       uuid not null,  -- references auth.users(id)

  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','suspended','canceled')),
  subscription_plan   text not null default 'starter'
    check (subscription_plan in ('starter','pro')),

  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  past_due_since       timestamptz,   -- เริ่มค้างจ่ายเมื่อไหร่ (คำนวณ grace period จากตรงนี้)
  suspended_at         timestamptz,
  canceled_at          timestamptz,

  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) shop_members — ผูก user คนหนึ่งเข้ากับอู่ + สิทธิ์
--    1 user เป็นสมาชิกได้หลายอู่พร้อมกัน (คนละ role ก็ได้)
-- ------------------------------------------------------------
create table shop_members (
  member_id     bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  user_id       uuid not null,  -- references auth.users(id)
  role          text not null
    check (role in ('owner','manager','supervisor','technician','assistant')),
  status        text not null default 'active'
    check (status in ('active','invited','disabled')),
  invited_by    uuid,
  created_at    timestamptz not null default now(),
  unique (shop_id, user_id)
);

create index idx_shop_members_user on shop_members (user_id);
create index idx_shop_members_shop on shop_members (shop_id);

-- ------------------------------------------------------------
-- 3) เพิ่ม shop_id ให้ตารางที่ต้องแยกข้อมูลตามอู่
--    (ข้อมูลรถ brands/models/generations เป็น global ไม่ต้องแยก)
-- ------------------------------------------------------------
alter table parts   add column if not exists shop_id bigint references shops(shop_id);
alter table zones   add column if not exists shop_id bigint references shops(shop_id);
alter table options add column if not exists shop_id bigint references shops(shop_id);

-- ------------------------------------------------------------
-- 4) Helper function: เช็คว่า user คนนี้เป็นสมาชิก active ของ shop นี้ไหม
--    และมี role อยู่ใน list ที่กำหนดหรือเปล่า (ใช้ใน RLS policy ทุกตาราง)
-- ------------------------------------------------------------
create or replace function is_shop_member(p_shop_id bigint, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from shop_members
    where shop_id = p_shop_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(p_roles)
  );
$$;

-- เช็คว่า shop นี้ยังใช้งานได้อยู่ไหม (ไม่ suspended/canceled)
create or replace function is_shop_active(p_shop_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select subscription_status in ('trialing','active','past_due')
  from shops where shop_id = p_shop_id;
$$;

-- ------------------------------------------------------------
-- 5) user_sessions — ใช้บังคับ maxDevicesPerUser และ maxConcurrentSessions
--    ตามค่าที่กำหนดไว้ใน config/subscriptionTiers.js (ฝั่งแอป)
--    ตัวเลขจริงไม่ hardcode ในนี้ — อ่านจาก config ฝั่งแอปตอน insert/enforce
-- ------------------------------------------------------------
create table user_sessions (
  session_id    bigint generated always as identity primary key,
  user_id       uuid not null,
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  device_label  text,              -- เช่น "iPhone Safari", "Windows Chrome"
  ip_address    inet,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index idx_user_sessions_user on user_sessions (user_id);
create index idx_user_sessions_shop on user_sessions (shop_id);

-- Flow ตอน login สำเร็จ (ทำที่ฝั่งแอป ไม่ใช่ trigger):
-- 1. อ่าน maxDevicesPerUser จาก config/subscriptionTiers.js (ตอนนี้ = 2 ทุก tier)
-- 2. นับ session ปัจจุบันของ user นี้ -> ถ้าเกิน maxDevicesPerUser
--    ลบ session ที่ last_seen_at เก่าสุดออกก่อน (force logout เครื่องเก่าอัตโนมัติ)
-- 3. อ่าน maxConcurrentSessions ของ shop จาก config ตาม subscription_plan ปัจจุบัน
--    นับ session รวมทั้ง shop (distinct user_id) -> ถ้าเกิน ปฏิเสธ login ใหม่
--    พร้อมข้อความ "อู่นี้มีคนใช้งานพร้อมกันเต็มแล้ว ($current/$max) ลองใหม่อีกครั้ง"

-- ------------------------------------------------------------
-- 6) ตัวอย่าง RLS policy บนตาราง parts (ใช้แนวคิดเดียวกันกับ zones/options)
-- ------------------------------------------------------------
alter table parts enable row level security;

-- ดูได้ทุก role ที่เป็นสมาชิก active ของ shop นั้น (แม้ suspended ก็ยังดูได้ - read-only)
create policy "shop members can view parts" on parts
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  );

-- เพิ่มได้ตั้งแต่ช่างขึ้นไป + shop ต้องยัง active อยู่ (ไม่ suspended)
create policy "eligible roles can insert parts" on parts
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and is_shop_active(shop_id)
  );

-- แก้ไขได้ตั้งแต่ช่างขึ้นไป (ไม่รวมผู้ช่วยช่าง) + shop ต้อง active
create policy "eligible roles can update parts" on parts
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician'])
    and is_shop_active(shop_id)
  );

-- soft-delete (is_active=false) ทำได้ตั้งแต่หัวหน้างานขึ้นไป
create policy "supervisors+ can soft delete parts" on parts
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor'])
  );

-- ลบถาวรได้แค่ owner/manager
create policy "managers+ can hard delete parts" on parts
  for delete using (
    is_shop_member(shop_id, array['owner','manager'])
  );

-- ============================================================
-- หมายเหตุการ implement ต่อ:
-- 1. ต้องเปิดใช้ Supabase Auth (email/password หรือ OTP) ก่อน
-- 2. หน้า Login ต้องให้เลือก/ผูกกับ shop (ถ้า user เป็นสมาชิกหลายอู่)
-- 3. เพิ่มหน้า "เชิญสมาชิกใหม่" ให้ owner/manager เชิญคนเข้าอู่ + กำหนด role
-- 4. เชื่อม payment gateway (เช่น Omise/2C2P สำหรับไทย) เพื่ออัปเดต
--    subscription_status อัตโนมัติผ่าน webhook
-- 5. Cron job (Supabase Edge Function scheduled) เช็คทุกวัน:
--    - past_due เกิน 7 วัน → suspended
--    - canceled เกิน 90 วัน → ลบข้อมูลถาวรตามนโยบาย
-- ============================================================
