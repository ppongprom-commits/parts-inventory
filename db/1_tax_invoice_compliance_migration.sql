-- ============================================================
-- Migration: เพิ่มข้อมูลที่จำเป็นสำหรับออกใบกำกับภาษีตามกรมสรรพากร
-- (มาตรา 86/4 แห่งประมวลรัษฎากร)
-- ============================================================

-- ข้อมูลร้าน/อู่ (ผู้ออกเอกสาร) — จำเป็นต้องมีเลขประจำตัวผู้เสียภาษี + ที่อยู่
alter table shops add column if not exists address text;
alter table shops add column if not exists tax_id text; -- เลขประจำตัวผู้เสียภาษีอากร 13 หลัก
alter table shops add column if not exists phone text;

-- ข้อมูลลูกค้า (ผู้ซื้อ/ผู้รับบริการ) — กฎหมายกำหนดว่าใบกำกับภาษีเต็มรูปต้องมีที่อยู่ผู้ซื้อ
alter table customers add column if not exists address text;

-- เผื่อบางงานอยากระบุที่อยู่ลูกค้าตรงๆ ตอนรับงาน (ไม่ต้องผูกกับ customers เสมอไป
-- เช่น กรณีลูกค้าครั้งเดียวไม่ได้ผูกเบอร์โทร) — เก็บ snapshot ไว้ที่ job ด้วย
alter table jobs add column if not exists customer_address text;
