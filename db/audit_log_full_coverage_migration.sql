-- การ์ด "ขยาย audit_log ให้ครอบทั้งระบบ + ใส่ changed_by_user_id จริง" — ไฟล์นี้แทนที่
-- db/audit_log_parts_coverage_migration.sql บางส่วน (superseded — ดูหมายเหตุด้านล่าง)
--
-- ⚠️ พบของจริงบน staging ที่ใหญ่กว่าที่คิดไว้ตอนแรกมาก: มี generic trigger function
-- fn_audit_row_change() ซึ่งครอบทุกตารางที่การ์ดต้องการอยู่แล้วจริง — parts, jobs, shop_members,
-- shops (บางคอลัมน์), zones, options — ทั้งหมดจากเซสชันก่อนหน้าที่การ์ดถูก mark "In progress"
-- แต่ไม่เคย commit สักไฟล์เดียว ขอบเขตในการ์ด (parts/jobs/shop_members/shops/options/zones)
-- จึงเสร็จไปเกือบหมดแล้วจริงๆ ก่อนจะมาถึงมือเราด้วยซ้ำ
--
-- ⚠️ Regression ที่เกิดจากตัวเราเอง (session นี้เอง ก่อนหน้านี้ไม่กี่ชั่วโมง): ตอนทำการ์ดนี้รอบแรก
-- ยังไม่รู้เรื่อง fn_audit_row_change() ที่ครอบทุกตารางอยู่แล้ว สร้างฟังก์ชัน audit_parts_changes()
-- ของตัวเองแยกต่างหาก แล้วชี้ trg_audit_parts ไปที่ฟังก์ชันนั้นแทน (เข้าใจผิดว่า trigger เดิมเป็น
-- ของเฉพาะ parts ตัวเดียว) ทำให้ parts หลุดออกจาก pattern กลางที่ตารางอื่นใช้ร่วมกันอยู่ — แก้คืนที่
-- นี่: เอา parts กลับไปใช้ fn_audit_row_change() เดียวกับตารางอื่นทั้งหมด (ไม่มีผลกับแถว audit_log
-- เก่าที่เขียนไปแล้วระหว่างช่วงที่ใช้ audit_parts_changes() — โครงสร้างข้อมูลเหมือนกันทุกอย่าง)
--
-- ปรับปรุง 1 จุดในตัว fn_audit_row_change() เอง: เพิ่มการข้าม UPDATE ที่ไม่มีอะไรเปลี่ยนจริง
-- (old = new เป๊ะ) — ของเดิมบันทึกทุก UPDATE แม้ไม่มีอะไรเปลี่ยน (เช่น touch เฉยๆ) จะทำให้ตาราง
-- audit_log โตเปล่าประโยชน์ ส่วน parts ที่เคยใช้ audit_parts_changes() ของเราเองมี check นี้อยู่แล้ว
-- เอาพฤติกรรมเดียวกันมาใส่ในฟังก์ชันกลางแทน ให้ทุกตารางได้ผลเหมือนกัน
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

-- คืน parts ให้กลับไปใช้ฟังก์ชันกลางเหมือนตารางอื่น (แก้ regression ที่อธิบายไว้ด้านบน)
drop trigger if exists trg_audit_parts on parts;
create trigger trg_audit_parts
  after insert or delete or update on parts
  for each row execute function fn_audit_row_change();

-- ฟังก์ชันเฉพาะ parts ตัวเก่าไม่ใช้แล้ว — ลบทิ้งกันสับสนว่ามี 2 pattern
drop function if exists audit_parts_changes();

-- shops: เพิ่ม force_zone_scan_confirmation (คอลัมน์ใหม่จากการ์ด "ย้ายอะไหล่ระหว่าง Zone" คืนนี้)
-- เข้า watch list เดิม — ของเดิมจับแค่ address/tax_id/phone/company_name/shop_name ไม่มีคอลัมน์นี้
drop trigger if exists trg_audit_shops on shops;
create trigger trg_audit_shops
  after update of address, tax_id, phone, company_name, shop_name, force_zone_scan_confirmation on shops
  for each row execute function fn_audit_row_change();

-- ตารางอื่น (jobs/shop_members/options/zones) ใช้ fn_audit_row_change() ที่เพิ่งอัปเดตด้านบน
-- โดยอัตโนมัติอยู่แล้ว (create or replace function ไม่ต้องแตะ trigger ของตารางเหล่านั้นเลย)
