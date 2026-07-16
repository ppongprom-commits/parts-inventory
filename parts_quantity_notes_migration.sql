-- ============================================================
-- Migration: เพิ่มคอลัมน์ "จำนวน" และ "หมายเหตุ" ให้ตาราง parts (staging)
-- ============================================================

alter table parts add column if not exists quantity numeric not null default 1;
alter table parts add column if not exists notes text;
