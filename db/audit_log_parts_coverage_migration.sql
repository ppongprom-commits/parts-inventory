-- การ์ด "ขยาย audit_log ให้ครอบทั้งระบบ + ใส่ changed_by_user_id จริง"
--
-- ⚠️⚠️ อัปเดต (ยังคืนนี้เอง): ส่วน "audit_parts_changes() / trg_audit_parts" ท้ายไฟล์นี้ถูกแทนที่
-- แล้วโดย db/audit_log_full_coverage_migration.sql — ตอนเขียนไฟล์นี้รอบแรกยังไม่รู้ว่ามี generic
-- trigger function fn_audit_row_change() ที่ครอบ parts/jobs/shop_members/shops/options/zones
-- อยู่แล้วจริงบน staging (อีกจุด drift ที่ใหญ่กว่าที่คิด) เข้าใจผิดว่า trg_audit_parts เดิมเป็น
-- ของเฉพาะ parts เลยสร้างฟังก์ชันแยกของตัวเอง กลายเป็น regression (parts หลุดจาก pattern กลาง) —
-- ไฟล์ audit_log_full_coverage_migration.sql แก้คืนให้ parts กลับไปใช้ fn_audit_row_change()
-- เหมือนตารางอื่นแล้ว ส่วนที่ยังใช้ได้จากไฟล์นี้คือคอลัมน์/RLS policy/RPC get_part_audit_history
-- ด้านล่าง (ยังถูกต้องอยู่ ไม่ต้องแก้)
--
-- ⚠️ Schema drift ที่พบคืนนี้ (แก้ตามกระบวนการกัน drift ใน SOP.md) — ทั้งหมดนี้มีอยู่แล้วจริงบน
-- staging จากเซสชันก่อนหน้าที่การ์ดนี้ถูก mark "In progress" แต่ไม่เคย commit กลับ repo เลย:
--  - audit_log.record_id เปลี่ยนจาก NOT NULL เป็น nullable
--  - เพิ่มคอลัมน์ audit_log.record_uuid (uuid) — ตารางที่ primary key เป็น uuid เช่น parts ใช้
--    คอลัมน์นี้แทน record_id (bigint) เดิมที่ออกแบบไว้สำหรับ model_generations/model_trims เท่านั้น
--  - เพิ่มคอลัมน์ audit_log.shop_id (bigint, FK -> shops, on delete set null)
--  - แก้ RLS policy จาก "Allow public read audit_log" (using (true) — ร้านไหนก็อ่าน log ร้านอื่นได้
--    หมด บั๊กความปลอดภัยข้าม tenant) เป็น "shop owner/manager can view own shop audit_log"
--    (scope ตาม shop_id + is_shop_member owner/manager)
-- ไฟล์นี้ export กลับให้ตรงของจริงทั้งหมด verify แล้วว่า idempotent

alter table audit_log alter column record_id drop not null;
alter table audit_log add column if not exists record_uuid uuid;
alter table audit_log add column if not exists shop_id bigint references shops(shop_id) on delete set null;

create index if not exists idx_audit_log_record_uuid on audit_log (table_name, record_uuid);
create index if not exists idx_audit_log_shop on audit_log (shop_id);

drop policy if exists "Allow public read audit_log" on audit_log;
drop policy if exists "shop owner/manager can view own shop audit_log" on audit_log;
create policy "shop owner/manager can view own shop audit_log" on audit_log
  for select using (
    shop_id is null or is_shop_member(shop_id, array['owner', 'manager'])
  );
-- หมายเหตุ: ไม่มี policy insert/update/delete ให้ authenticated/anon โดยตั้งใจ — append-only
-- โดยธรรมชาติของ RLS (ไม่มี policy = ปฏิเสธ default) เขียนได้เฉพาะผ่าน SECURITY DEFINER
-- function/trigger เท่านั้น (bypass RLS ในฐานะ definer)
--
-- ⚠️ ขอบเขตที่ยังไม่ตัดสินใจจากการ์ด (ทิ้งไว้ตามเดิม ไม่เปลี่ยนรอบนี้): role ที่ต่ำกว่า
-- owner/manager (เช่น supervisor) ยังดู audit_log ทั้งร้านไม่ได้ — ตรงกับที่การ์ด Field Scanner
-- ตัดสินใจแยกไว้ว่าต้องมี "UI แสดงประวัติการแก้ไขเฉพาะของ part นั้นๆ" ในหน้า edit part ต่างหาก
-- (ไม่ใช่หน้า audit log เต็มระบบ) — ดู RPC get_part_audit_history ด้านล่างที่เปิดให้ role
-- กว้างกว่า owner/manager ดูได้เฉพาะประวัติของ part เดียวที่กำลังแก้ไข ไม่ใช่ log ทั้งร้าน

-- ------------------------------------------------------------
-- ของใหม่จริงในรอบนี้: ขยาย coverage ไปที่ parts (เพิ่ม/แก้/ลบ — รวมการขายที่แก้ quantity ผ่าน
-- deduct_part_stock RPC ด้วย เพราะ trigger จับที่ระดับตาราง ไม่สนช่องทางที่เขียนเข้ามา)
-- ------------------------------------------------------------
-- ⚠️ ส่วนสร้าง trigger เฉพาะ parts ที่เคยอยู่ตรงนี้ถูกย้าย/แทนที่แล้วโดย
-- db/audit_log_full_coverage_migration.sql — parts ใช้ fn_audit_row_change() ตัวเดียวกับตารางอื่น
-- ทั้งหมด (jobs/shop_members/shops/options/zones) ไม่มีฟังก์ชันแยกเฉพาะ parts อีกต่อไป
-- อย่าเพิ่ม trigger เฉพาะ parts กลับมาที่นี่ — รันไฟล์ audit_log_full_coverage_migration.sql
-- หลังไฟล์นี้เสมอเวลาติดตั้งใหม่ (fresh install)

-- RPC เดียว ใช้ทั้งหน้า edit part (ประวัติของชิ้นนี้) — SECURITY DEFINER เพื่อให้ role ที่ไม่ใช่
-- owner/manager (technician/assistant/field_scanner ในอนาคต ที่แก้ไขข้อมูล part ได้) เห็นประวัติ
-- การแก้ไขของ "part ที่ตัวเองกำลังดูอยู่" ได้ โดยไม่เปิด audit_log ทั้งร้านให้เห็นหมดตาม RLS ด้านบน
-- (ตรงกับที่การ์ด Field Scanner ตัดสินใจไว้ 19 ก.ค. 2026 — "ต้องมี UI ในเฟสแรก" สำหรับ edit part)
create or replace function get_part_audit_history(p_part_id uuid)
returns table (
  audit_id bigint,
  action text,
  old_data jsonb,
  new_data jsonb,
  changed_by_user_id uuid,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id bigint;
begin
  select shop_id into v_shop_id from parts where id = p_part_id;
  if v_shop_id is null then
    return;
  end if;
  if not is_shop_member(v_shop_id, array['owner', 'manager', 'supervisor', 'technician', 'assistant']) then
    raise exception 'ไม่มีสิทธิ์ดูประวัติของอะไหล่ชิ้นนี้';
  end if;

  return query
    select a.audit_id, a.action, a.old_data, a.new_data, a.changed_by_user_id, a.changed_at
    from audit_log a
    where a.table_name = 'parts' and a.record_uuid = p_part_id
    order by a.changed_at desc;
end;
$$;
