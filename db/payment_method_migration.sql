-- การ์ด "บันทึกวิธีชำระเงินแยกทุกช่องทาง (payment_method)"
--
-- ขอบเขตรอบนี้: เพิ่มคอลัมน์ + ใช้งานจริงเฉพาะช่องทางขายที่มีอยู่แล้ววันนี้ (ฟอร์มขายทีละชิ้นที่
-- /edit/[id]) — ไม่แตะ cart-based selling flow / part_sale_documents เพราะทั้ง 2 การ์ดนั้นยังไม่เริ่ม
-- และการ์ดต้นทางเตือนไว้ตรงๆ ว่าการทำ 3 การ์ดนี้แยกกันเสี่ยงได้ "หน้า checkout ที่ไม่มีช่องนี้เลย" —
-- ความเสี่ยงนั้นใช้กับ checkout ใหม่ที่ยังไม่สร้าง ไม่ใช่กับฟอร์มขายเดิมที่มีอยู่แล้ววันนี้ ตอน
-- cart-based selling flow เริ่มทำจริง ให้ใช้คอลัมน์เดียวกันนี้ต่อได้เลย ไม่ต้อง migration ซ้ำ

alter table part_sales add column if not exists payment_method text;
alter table part_sales drop constraint if exists part_sales_payment_method_check;
alter table part_sales add constraint part_sales_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'bank_transfer', 'card', 'other'));

-- ยังไม่ตัดสินใจ (ทิ้งไว้ตามการ์ด — ไม่ implement รอบนี้):
--  - ร้านมีหลายบัญชีธนาคาร ต้องเลือกบัญชีปลายทางไหม (รอ Accounting Module)
--  - ขายเชื่อ/เก็บเงินทีหลัง (credit) — ไม่อยู่ใน enum ตามการ์ดเดิม ไม่เพิ่มรอบนี้
--  - mapping payment_method -> account_code — รอ Accounting Module
