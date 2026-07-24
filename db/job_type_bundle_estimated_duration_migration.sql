-- ============================================================
-- เพิ่ม "เวลาที่ใช้โดยประมาณ (วัน)" ต่อเซต (job_type_bundle_templates) — ใช้คำนวณ
-- วันที่คาดว่าจะเสร็จของงานอัตโนมัติตอนเลือกเซตในหน้างาน (ดู jobs_estimated_completion_date_migration.sql
-- และ app/jobs/[id]/page.js: handleSelectBundleResult / handleApplyBundle)
-- ============================================================

alter table job_type_bundle_templates
  add column if not exists estimated_duration_days integer;
