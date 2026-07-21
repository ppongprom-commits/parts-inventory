-- ============================================================
-- Platform admin role tiers (Super Admin / Support / Analyst) +
-- platform_audit_log table
--
-- Card: "Platform admin role tiers — Super Admin / Support / Analyst"
-- (Priority: Highest, In progress)
--
-- SCHEMA DRIFT NOTE (found tonight, 20 ก.ค. 2026): both of these already
-- exist LIVE on staging (checked via direct DB query) — platform_admins.role
-- already has values 'super_admin' for both current admins, and
-- platform_audit_log already exists with exactly the schema below — but
-- neither was ever committed to db/. This file closes that gap. All
-- statements are idempotent (IF NOT EXISTS / ON CONFLICT-safe UPDATE) so
-- it's safe to run against an environment that already has these changes
-- applied directly, or a fresh environment that doesn't.
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

-- ✅ ตัดสินใจแล้ว (19 ก.ค. 2026): ppongprom@gmail.com เป็น super_admin คนเดียว
-- ต้องรันก่อนเริ่ม enforce permission matrix ไม่งั้นจะโดน default 'support' ล็อกสิทธิ์ตัวเองทันที
update platform_admins
set role = 'super_admin'
where user_id = (select id from auth.users where email = 'ppongprom@gmail.com')
  and role is distinct from 'super_admin';

-- ------------------------------------------------------------
-- 2) platform_audit_log — แยกจาก audit_log ของร้าน (การ์ด "Platform admin
--    audit log" ตัดสินใจไว้แล้ว 19 ก.ค. 2026: แยกตาราง + ห้ามฝั่งร้านลูกค้าเห็นเด็ดขาด)
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
-- (ฝั่งร้านลูกค้าไม่มีทางเห็น log นี้ได้เลยแม้เป็น owner ร้านเอง — append-only + ไม่มี client access)
