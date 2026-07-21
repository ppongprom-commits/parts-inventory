-- การ์ด "ขยาย audit_log ให้ครอบทั้งระบบ + ใส่ changed_by_user_id จริง"
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
-- ตัดสินใจ (แก้ปัญหาที่การ์ดเปิดค้างไว้ "trigger-based vs RPC-based"): ใช้ trigger-based สำหรับ
-- parts เพราะ parts ถูกแก้ตรงผ่าน supabase.from("parts").insert/update/delete() จากหลายหน้า
-- (/add, /edit, cart selling flow ในอนาคต ฯลฯ) ไม่ได้ผ่าน RPC กลางจุดเดียวแบบ model_generations —
-- RPC-based จะจับไม่ครบทุกช่องทางตามที่การ์ดกังวลไว้ตรงๆ ("ใครแก้ table ตรง...จะหลุด log เงียบๆ")
--
-- ⚠️ พบอีก 1 จุด drift ตอนจะสร้าง trigger นี้: staging มี trigger ชื่อ trg_audit_parts อยู่แล้วจริง
-- (พบแถว audit_log เก่าจากเมื่อวาน 20 ก.ค. ที่มี changed_by_user_id จริงอยู่ก่อนไฟล์นี้จะถูกรันด้วยซ้ำ)
-- จากเซสชันก่อนหน้าเช่นกัน แต่ logic เดิมไม่เคย commit ไม่มีทางรู้ว่าต่างจากด้านล่างนี้ตรงไหน —
-- ใช้ `create or replace` + `drop/create trigger` แทนที่ด้วยเวอร์ชันที่ผ่านการ verify แล้วรอบนี้
-- (ยืนยันด้วยการรัน update จริงบน staging แล้วเช็คว่า log ขึ้นถูก — ไม่กระทบแถว audit_log เก่าที่มีอยู่)
create or replace function audit_parts_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (table_name, record_uuid, action, old_data, new_data, changed_by_user_id, shop_id)
    values ('parts', new.id, 'INSERT', null, to_jsonb(new), auth.uid(), new.shop_id);
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into audit_log (table_name, record_uuid, action, old_data, new_data, changed_by_user_id, shop_id)
      values ('parts', new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), new.shop_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (table_name, record_uuid, action, old_data, new_data, changed_by_user_id, shop_id)
    values ('parts', old.id, 'DELETE', to_jsonb(old), null, auth.uid(), old.shop_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_parts on parts;
create trigger trg_audit_parts
  after insert or update or delete on parts
  for each row execute function audit_parts_changes();

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
