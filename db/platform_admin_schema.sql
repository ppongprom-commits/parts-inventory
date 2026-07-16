-- ============================================================
-- Platform Admin — ระบุ user ที่เป็น "เจ้าของแพลตฟอร์ม" (ไม่ใช่เจ้าของอู่)
-- เข้าถึงข้อมูลได้แค่ผ่าน service role key ใน API route เท่านั้น
-- ไม่มี RLS policy ให้ anon/authenticated เข้าถึงตรงๆ เลย
-- ============================================================
create table platform_admins (
  user_id     uuid primary key references auth.users(id),
  note        text,
  created_at  timestamptz not null default now()
);

alter table platform_admins enable row level security;
-- ไม่สร้าง policy ใดๆ ทั้งสิ้น = ไม่มีใครอ่าน/เขียนผ่าน anon key ได้เลย
-- (เข้าถึงได้เฉพาะผ่าน service role key ที่ข้าม RLS อัตโนมัติ)

-- ============================================================
-- เพิ่มตัวเองเป็น platform admin คนแรก (รันหลัง signup สร้างบัญชีแล้ว)
-- แทน 'your-email@example.com' ด้วยอีเมลที่ signup ไว้
-- ============================================================
-- insert into platform_admins (user_id)
-- select id from auth.users where email = 'your-email@example.com';
