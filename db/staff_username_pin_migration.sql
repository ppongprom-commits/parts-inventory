-- ============================================================
-- Migration: Staff username+PIN login (ไม่ต้องใช้อีเมลจริง)
-- รันหลังจาก db/team_invite_and_notes_migration.sql แล้ว
-- ============================================================

-- เก็บ username ที่พนักงานใช้ login (คนละอันจากอีเมลปลอมที่เก็บใน auth.users)
alter table shop_members add column if not exists login_username text;

-- unique เฉพาะแถวที่มีค่า (สมาชิกแบบอีเมลจริง เช่น owner/manager จะเป็น null)
create unique index if not exists idx_shop_members_login_username
  on shop_members (login_username)
  where login_username is not null;

-- หมายเหตุ: การสร้างบัญชีพนักงาน (auth.users + shop_members) ทำผ่าน
-- app/api/team/create-staff/route.js (server-side, ใช้ Service Role Key
-- เรียก supabaseAdmin.auth.admin.createUser) ไม่ได้ทำผ่าน RPC เพราะ
-- การสร้าง auth user ต้องใช้สิทธิ์ admin ที่ RPC ทั่วไป (security definer
-- ธรรมดา) เรียกไม่ได้
