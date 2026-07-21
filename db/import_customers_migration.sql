-- การ์ด "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory"
--
-- ขอบเขต: import ทีเดียว (one-time per upload) ผ่านไฟล์ CSV เท่านั้นรอบนี้ (การ์ดถามไว้ว่า
-- one-time หรือ incremental — ยังไม่ตัดสินใจตรงๆ แต่ลักษณะ UI ที่ทำ (upload -> preview -> confirm)
-- ทำซ้ำได้เรื่อยๆ อยู่แล้วโดยธรรมชาติ ไม่ต้องมี concept "incremental" แยก)
--
-- ตัดสินใจเอง (การ์ดทิ้งเป็น gap ไว้ บล็อกการเขียน integration test ตรงๆ ถ้าไม่ตัดสินใจ):
--  - Duplicate merge behavior: **skip ไม่ import ซ้ำ** ถ้าเบอร์โทรตรงกับลูกค้าที่มีอยู่แล้วในร้าน
--    (ไม่ merge/ไม่ทับข้อมูลเดิมเงียบๆ — ปลอดภัยสุดสำหรับข้อมูลลูกค้าที่มาจากการขายจริงอยู่ก่อน)
--    รายงานจำนวนที่ skip ให้เห็นชัดเจนในผลลัพธ์ ไม่ import ซ้ำแบบเงียบๆ
--  - Matching key: เบอร์โทรเท่านั้น (ชื่ออย่างเดียวไม่นับเป็น duplicate — ชื่อซ้ำกันได้บ่อยในไทย)
--  - Field บังคับ: อย่างน้อยต้องมี "ชื่อ" หรือ "เบอร์โทร" อย่างใดอย่างหนึ่ง (ไม่ว่างทั้งคู่)
--  - สิทธิ์ import: จำกัดแค่ owner/manager (บังคับที่ RequireAuth ของหน้า — RLS ของ customers เดิม
--    กว้างกว่านี้ อนุญาต supervisor/technician/assistant insert ได้ด้วย แต่หน้า import จำกัดเพิ่มเอง)

-- ต่อ customers เข้า audit_log กลาง (fn_audit_row_change จากการ์ด "ขยาย audit_log") — ตอบโจทย์
-- test scenario "Audit trail: บันทึกใคร import เมื่อไหร่ กี่แถวสำเร็จ/ล้มเหลว" (จำนวนสำเร็จ/ล้มเหลว
-- ดูจากนับแถว INSERT ใน audit_log ช่วงเวลานั้นได้ — ไม่ได้ทำ batch_id แยกต่างหากรอบนี้)
create or replace function fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row       jsonb;
  v_shop_id   bigint;
  v_record_id bigint;
  v_record_uuid uuid;
  v_old       jsonb;
  v_new       jsonb;
begin
  if TG_OP = 'UPDATE' and to_jsonb(OLD) = to_jsonb(NEW) then
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
  else
    v_row := to_jsonb(NEW);
  end if;

  v_shop_id := nullif(v_row->>'shop_id', '')::bigint;

  if TG_TABLE_NAME in ('parts', 'zones', 'options') then
    v_record_uuid := nullif(v_row->>'id', '')::uuid;
  elsif TG_TABLE_NAME = 'jobs' then
    v_record_id := nullif(v_row->>'job_id', '')::bigint;
  elsif TG_TABLE_NAME = 'shop_members' then
    v_record_id := nullif(v_row->>'member_id', '')::bigint;
  elsif TG_TABLE_NAME = 'shops' then
    v_record_id := nullif(v_row->>'shop_id', '')::bigint;
  elsif TG_TABLE_NAME = 'salvage_vehicles' then
    v_record_id := nullif(v_row->>'vehicle_id', '')::bigint;
  elsif TG_TABLE_NAME = 'customers' then
    v_record_id := nullif(v_row->>'customer_id', '')::bigint;
  end if;

  if TG_OP = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    v_old := to_jsonb(OLD);
    v_new := null;
  end if;

  insert into audit_log (
    table_name, record_id, record_uuid, action, old_data, new_data,
    shop_id, changed_by_user_id
  ) values (
    TG_TABLE_NAME, v_record_id, v_record_uuid, TG_OP, v_old, v_new,
    v_shop_id, auth.uid()
  );

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

drop trigger if exists trg_audit_customers on customers;
create trigger trg_audit_customers
  after insert or delete or update on customers
  for each row execute function fn_audit_row_change();
