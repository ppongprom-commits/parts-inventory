-- การ์ด "Field Scanner Role + temp account auto-expiry"
--
-- ⚠️ Schema drift ที่พบคืนนี้ (แก้ตามกระบวนการกัน drift ใน SOP.md): บทบาท 'field_scanner' มีอยู่แล้ว
-- จริงบน staging ทั้งใน shop_members_role_check และ RLS policy ของ parts/zones/customers
-- (customers ตั้งใจ "ไม่รวม" field_scanner ไว้แล้วถูกต้องตามที่การ์ดตัดสินใจ — field scanner ไม่เห็น
-- ข้อมูลลูกค้าเลย) — ทั้งหมดนี้จากเซสชันก่อนหน้าที่ไม่เคย commit เลย ไฟล์นี้ export กลับให้ตรงของจริง
--
-- ของใหม่จริงในรอบนี้: shop_members.expires_at — ยังไม่มีอยู่จริงบน staging ก่อนหน้านี้

alter table shop_members add column if not exists expires_at timestamptz;
comment on column shop_members.expires_at is
  'null = ไม่มีวันหมดอายุ (บัญชีปกติ) มีค่า = บัญชีชั่วคราว (เช่น Field Scanner burst mode) ที่ผ่านเวลานี้แล้ว login ไม่ได้อีก — เช็คที่ lib/AuthProvider.js ตอน resolve membership';

-- หมายเหตุ: ยังไม่มี scheduled job ตัด session ที่ login ค้างอยู่ตอนหมดอายุ (การ์ดเองบอกว่า
-- "Vercel cron หรือ Supabase pg_cron" ยังไม่ตัดสินใจ) — รอบนี้ทำแค่ "กัน login ใหม่หลังหมดอายุ"
-- (เช็คฝั่ง client ตอน resolve membership) ส่วน "ตัด session ที่ active อยู่ตอนหมดอายุจริง" ยังไม่ทำ
