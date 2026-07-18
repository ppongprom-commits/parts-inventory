-- ============================================================
-- Migration: car_search_display view (v2 — เวอร์ชันย่อ ตรงกับที่ apply จริงบน staging/beta)
--
-- v1 (เวอร์ชันแรก) เคยมี UNION ALL เพิ่มแถว "ไม่ระบุ trim" ให้ทุก generation เอง
-- แต่พบว่าทุก generation มี trim "ไม่ระบุ" เป็น fallback สะสมไว้อยู่แล้วจากงาน
-- Car Trim Database (398 แถวที่ beta, 397 แถวที่ staging) ทำให้ v1 สร้างตัวเลือก
-- "ไม่ระบุ" ซ้ำกัน 2 อันในช่องค้นหา (bug ที่เจอและแก้ตรงบน DB ไปแล้ว)
--
-- v2 นี้แค่ query จาก model_trims ตรงๆ ไม่ต้องมี UNION อีก
-- ============================================================

create or replace view car_search_display as
select
  g.generation_id,
  t.trim_id,
  b.brand_name,
  m.model_name,
  g.generation_code,
  gd.year_range_display,
  g.vehicle_type,
  t.trim_name,
  t.powertrain_type
from model_trims t
join model_generations g on g.generation_id = t.generation_id
join models m on m.model_id = g.model_id
join brands b on b.brand_id = m.brand_id
join model_generations_display gd on gd.generation_id = g.generation_id;
