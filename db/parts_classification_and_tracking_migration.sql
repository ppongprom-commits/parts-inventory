-- ============================================================
-- Phase 1: แยกประเภทอะไหล่ — salvage (ถอดจากรถ รอขาย) vs consumable (ของสิ้นเปลืองใช้ในงานซ่อม)
-- ============================================================
alter table parts add column if not exists item_type text not null default 'salvage'
  check (item_type in ('salvage', 'consumable'));

-- ============================================================
-- Phase 2: คุมสต็อก consumable ด้วย min-stock level
-- ============================================================
alter table parts add column if not exists min_stock_level numeric;

-- view ช่วยหาของใกล้หมด — ใช้เพราะ Supabase filter เทียบ 2 คอลัมน์กันเองตรงๆ ไม่ได้
-- (quantity <= min_stock_level ต้องทำฝั่ง SQL แล้ว query ผ่าน view นี้แทน)
-- security_invoker = true สำคัญมาก — ทำให้ view สืบทอด RLS ของตาราง parts จริง
-- (ไม่งั้น view จะรันด้วยสิทธิ์เจ้าของ view แทน อาจเห็นข้อมูลข้ามอู่ได้)
create or replace view low_stock_parts
with (security_invoker = true)
as
select *
from parts
where item_type = 'consumable'
  and min_stock_level is not null
  and quantity <= min_stock_level
  and is_active = true;

-- ============================================================
-- Phase 3: ติดตามอะไหล่ถอด (salvage) + คำนวณกำไรต่อคัน
-- ============================================================
-- ราคาซื้อรถทั้งคัน (ก่อนถอดแยกขาย) — ใช้คำนวณกำไรเทียบกับยอดขายอะไหล่ที่ถอดจากคันนี้
alter table jobs add column if not exists vehicle_purchase_price numeric;
