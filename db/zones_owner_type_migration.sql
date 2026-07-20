-- ============================================================
-- zones.owner_type + zones.owner_entity_id
--
-- Card: "zones.owner_type + owner_entity_id — prerequisite ของ Accounting Module
-- (blocker #1)" (สถานะใน Notion: "Not started")
--
-- SCHEMA DRIFT FOUND (20 ก.ค. 2026 — 4th instance found tonight, same pattern as
-- model_trims data, platform_admins.role, platform_audit_log): this card's Notion
-- status says "Not started", but both columns already exist LIVE on staging
-- (checked via direct DB query) and app/admin/zones/page.js already has working
-- edit UI for owner_type (edit form + save handler). The work is NOT "not
-- started" — it appears to have been done directly on the DB + a previous
-- session's code change, just never committed as a migration file, and the
-- Notion card was never updated to reflect it either. Only closing the git gap
-- here — no new application logic added (that's already live and working).
--
-- ✅ ค่าจริงบน staging ตอนนี้ (verify แล้ว): 157/157 แถวเป็น owner_type='own' ทั้งหมด
-- (ยังไม่มีร้านไหนใช้ consignment/investor จริง) owner_entity_id เป็น null ทั้งหมด
-- ยังไม่มี FK ผูกไว้ (ตั้งใจ — รอ Accounting Module กำหนดว่าจะอ้างตารางไหน)
-- ============================================================

alter table zones add column if not exists owner_type text not null default 'own';
alter table zones add column if not exists owner_entity_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'zones_owner_type_check'
  ) then
    alter table zones
      add constraint zones_owner_type_check
      check (owner_type in ('own', 'consignment', 'investor'));
  end if;
end $$;

-- หมายเหตุ: owner_entity_id ไม่มี FK ผูกไว้ตั้งใจ — รอการ์ด Accounting Module ตัดสินใจ
-- ว่า consignment/investor จะอ้างตารางไหน (ยังไม่มีตาราง "เจ้าของฝากขาย"/"นักลงทุน" ในระบบ)
