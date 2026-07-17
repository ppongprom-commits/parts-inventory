-- ============================================================
-- Migration: เพิ่มคอลัมน์ trim_id ให้ตาราง jobs
-- (parts มีคอลัมน์นี้อยู่แล้วจาก ora_good_cat_generation_fix.sql)
-- ใช้คู่กับ CarCascadeSelect component ตัวใหม่ที่หน้า /jobs/new
-- ============================================================

alter table jobs add column if not exists trim_id bigint references model_trims(trim_id);
