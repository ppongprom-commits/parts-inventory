-- ============================================================
-- Migration: เพิ่มคอลัมน์ "เลขที่อะไหล่ (Part Number)" ให้ตาราง parts (staging)
-- ============================================================

alter table parts add column if not exists part_number text;

-- index ไว้เผื่ออนาคตอยากค้นหา/กรองด้วยเลขอะไหล่
create index if not exists idx_parts_part_number on parts (part_number) where part_number is not null;
