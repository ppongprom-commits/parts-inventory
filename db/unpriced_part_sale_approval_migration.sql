-- ============================================================
-- Card: "ขายอะไหล่ที่ยังไม่ตีราคา + แก้ไขราคาต้นทุน/ขายตอน checkout (Approval Flow แบบ
-- configurable)" (Notion page 3a2f39f4564981c48afff3107201782d, Priority High — 24 ก.ค. 2026)
--
-- Reuse decisions (สำคัญ — อ่านก่อนแก้ไฟล์นี้ต่อ):
-- 1. Toggle ระดับร้าน + ผู้อนุมัติ configurable (role หรือ user เฉพาะ) ไม่สร้างตารางใหม่ — ใช้
--    admin_action_approval_config/pending_admin_actions/decide_pending_admin_action() ที่มีอยู่
--    แล้วจริงจากการ์ด "Admin Role (7th role) — Maker-Checker" (db/admin_action_approval_migration.sql)
--    ตรงตามที่การ์ดนี้เองแนะนำให้ตรวจสอบก่อนสร้างระบบคู่ขนาน — คอลัมน์ requires_approval/
--    approver_role/approver_user_id ตรงกับ requirement เป๊ะอยู่แล้ว (shop-level toggle + เลือกได้
--    ทั้ง role/user เฉพาะ) แค่เพิ่ม action_type ใหม่ 'sell_unpriced_part' เข้า CHECK constraint
-- 2. Self-approval: ไม่เพิ่มเงื่อนไขห้าม performed_by = auth.uid() ใน decide_pending_admin_action()
--    เดิม (ไม่มีอยู่แล้ว) — ตรงกับมติ "self-approval อนุญาต" ของการ์ดนี้พอดี ไม่ต้องแก้ฟังก์ชันเลย
-- 3. Audit trail ของการแก้ allocated_cost: parts มี trg_audit_parts (fn_audit_row_change()) ที่
--    ครอบทุกคอลัมน์อยู่แล้ว (after insert or delete or update on parts — ไม่ใช่ column-scoped แบบ
--    shops) แปลว่า UPDATE allocated_cost ใดๆ ถูกบันทึกเป็น audit_log แถวใหม่ (old_data/new_data =
--    ทั้งแถว, changed_by_user_id = auth.uid(), created_at) โดยอัตโนมัติอยู่แล้ว — ไม่ต้องสร้าง
--    audit mechanism ใหม่ ยืนยันแล้วด้วย fn_audit_row_change() ใน
--    db/audit_log_full_coverage_migration.sql (ไม่มี "update of <columns>" กำกับ trigger ของ parts)
--    เพิ่มแค่คอลัมน์ cost_override_reason ให้กรอกเหตุผลได้ (ไม่บังคับ) — ค่าที่กรอกจะติดไปกับ
--    old_data/new_data คู่เดียวกันตอน checkout UPDATE parts พร้อมกับ allocated_cost เลย ไม่ต้อง
--    insert audit_log เองแยกต่างหาก
-- 4. Reconcile invariant Σ allocated_cost = purchase_price: **ไม่ทำ** ตามมติที่ตัดสินใจแล้ว (24 ก.ค.
--    2026) — override ที่ checkout คือ point-in-time correction เฉพาะจุด ไม่ใช่ allocate ครั้งแรก
--    invariant ของการ์ด Salvage cost allocation ใช้ได้แค่ตอน allocate ครั้งแรกเท่านั้น
-- 5. Stock Value Cap (shops.current_stock_value): คำนวณจาก parts ที่ยังอยู่ในสต็อก
--    (fn_recalc_stock_cap_status / trigger บน parts, ดู stock_value_cap_engine_migration.sql +
--    stock_value_cap_allocated_cost_migration.sql) — ของที่ขายไปแล้ว (quantity ถูกตัดออกจาก parts
--    ทันทีตอน checkout ไม่ว่า pending_approval หรือไม่ ตามมติการ์ด "ขายได้ทันที") ไม่ถูกนับใน
--    current_stock_value อยู่แล้วโดยธรรมชาติ ไม่ต้องแก้ตรงจุดนี้เพิ่ม — สิ่งที่ต้องแก้จริงคือ
--    "Stock Summary Report" (app/admin/reports/page.js) ที่ query part_sales ตรงๆ มารวมยอดขาย —
--    เพิ่ม filter exclude approval_status='pending_approval' ที่โค้ด (ดู commit เดียวกัน)
-- ============================================================

-- ------------------------------------------------------------
-- 1) เพิ่ม action_type ใหม่เข้า Maker-Checker approval config ที่มีอยู่แล้ว
-- ------------------------------------------------------------
alter table admin_action_approval_config drop constraint if exists admin_action_approval_config_action_type_check;
alter table admin_action_approval_config add constraint admin_action_approval_config_action_type_check
  check (action_type in (
    'edit_part_cost','edit_part_general','edit_part_price','reprint_document',
    'void_document','issue_credit_note','import_customers','edit_customer_contact',
    'edit_customer_credit_terms','review_duplicate_photo','confirm_duplicate_delete',
    'resolve_discrepancy_writeoff','view_reports','export_csv',
    'sell_unpriced_part'
  ));

-- ------------------------------------------------------------
-- 2) part_sales: สถานะ approval สำหรับการขายอะไหล่ที่ยังไม่ตีราคา (approval flow เปิด)
--    - not_required: ค่า default — ทุกแถวเดิม/การขายปกติที่ไม่เข้าเงื่อนไข (approval flow ปิด
--      หรือ part มีราคาอยู่แล้ว) ไม่มีอะไรเปลี่ยนพฤติกรรม
--    - pending_approval: ขายแล้วจริง (ตัดสต็อกแล้ว) แต่รอผู้อนุมัติ — exclude จากรายงาน
--    - approved / rejected: ตัดสินใจแล้ว — ทั้งคู่นับเข้ารายงานตามปกติ (rejected ไม่คืนสต็อก/ไม่
--      reverse ตามมติการ์ด "คงขายไว้แต่แจ้งเจ้าของ" — แค่ flag ให้เจ้าของมาตรวจสอบ)
-- ------------------------------------------------------------
alter table part_sales add column if not exists approval_status text not null default 'not_required'
  check (approval_status in ('not_required', 'pending_approval', 'approved', 'rejected'));

-- เจ้าของ "รับทราบ" รายการที่ถูกปฏิเสธแล้ว (เคลียร์ออกจากรายการที่ต้องตรวจสอบ) — null = ยังไม่รับทราบ
alter table part_sales add column if not exists rejection_ack_at timestamptz;
alter table part_sales add column if not exists rejection_ack_by uuid references auth.users(id);

create index if not exists idx_part_sales_shop_approval on part_sales (shop_id, approval_status);

-- ------------------------------------------------------------
-- 3) parts: เหตุผลการแก้ไขราคาต้นทุน (ไม่บังคับ) — ใช้ประกอบ audit_log ที่ trg_audit_parts
--    บันทึกอัตโนมัติอยู่แล้ว (ดูหมายเหตุข้อ 3 ด้านบน) ไม่ใช่ mechanism ใหม่
-- ------------------------------------------------------------
alter table parts add column if not exists cost_override_reason text;

-- ------------------------------------------------------------
-- 4) RLS ของ pending_admin_actions เดิม จำกัดแค่ owner/manager/admin (สร้างมาสำหรับ Admin role
--    ทำงานเสี่ยงที่ Owner/Manager อนุมัติ) — แต่ sell_unpriced_part สร้างรายการรออนุมัติจาก
--    checkout ซึ่งทำได้โดย supervisor/technician/assistant ด้วย (ดู RequireAuth ของ
--    app/checkout/page.js) และผู้อนุมัติ (approver_role) เลือกเป็น "supervisor" ได้ด้วยจากหน้า
--    settings — ต้องขยาย policy ให้ครอบคลุม ไม่งั้นชนกำแพง RLS เงียบๆ (insert ไม่ผ่าน หรือ
--    เห็นคิวว่างเปล่าทั้งที่มีแถวจริง) เหมือนบั๊กที่เคยเจอกับ part_sales update policy มาก่อน
-- ------------------------------------------------------------
drop policy if exists "requester or owner/manager/admin can view pending actions" on pending_admin_actions;
create policy "requester or owner/manager/admin can view pending actions" on pending_admin_actions
  for select using (
    performed_by = auth.uid()
    or is_shop_member(shop_id, array['owner','manager','admin','supervisor'])
  );

drop policy if exists "eligible roles can create pending actions" on pending_admin_actions;
create policy "eligible roles can create pending actions" on pending_admin_actions
  for insert with check (
    performed_by = auth.uid()
    and is_shop_member(shop_id, array['owner','manager','admin','supervisor','technician','assistant'])
  );

-- ------------------------------------------------------------
-- 5) admin_action_approval_config เดิม select policy จำกัดแค่ owner/manager/admin ก็เจอปัญหา
--    เดียวกัน: /checkout ต้องอ่าน config ของ action_type 'sell_unpriced_part' เพื่อรู้ว่าต้องเข้า
--    approval flow ไหม แต่ checkout ทำได้โดย supervisor/technician/assistant ด้วย — ถ้าอ่านไม่ได้
--    (0 แถวเงียบๆ จาก RLS ไม่ error) จะ fallback ไป default เสมอ ทำให้ toggle ที่ร้านเปิดไว้ไม่มีผล
--    จริงสำหรับ role พวกนี้ — ขยาย select-only policy (ไม่แตะ ALL policy ของ owner/manager ที่ใช้
--    แก้ไขค่าอยู่ ยังจำกัดแค่ owner/manager เหมือนเดิม)
-- ------------------------------------------------------------
drop policy if exists "shop members can view approval config" on admin_action_approval_config;
create policy "shop members can view approval config" on admin_action_approval_config
  for select using (is_shop_member(shop_id, array['owner','manager','admin','supervisor','technician','assistant']));

-- ------------------------------------------------------------
-- Verification queries (run manually after applying):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'admin_action_approval_config'::regclass and contype = 'c';
--   select column_name from information_schema.columns where table_name = 'part_sales'
--     and column_name in ('approval_status','rejection_ack_at','rejection_ack_by');
--   select column_name from information_schema.columns where table_name = 'parts'
--     and column_name = 'cost_override_reason';
--   -- confirm generic audit trigger still fires for parts (unchanged, no re-create needed):
--   select tgname, tgrelid::regclass from pg_trigger where tgname = 'trg_audit_parts';
-- ------------------------------------------------------------
