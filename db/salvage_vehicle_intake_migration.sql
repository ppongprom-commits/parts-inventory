-- การ์ด "Salvage Vehicle Intake + Disassembly (core feature)"
--
-- ขอบเขตรอบนี้: เฉพาะ "Intake" — สร้าง entity salvage_vehicles, หน้ารับซากรถเข้าระบบ,
-- ผูก parts.salvage_vehicle_id (pattern เดียวกับ parts.job_id ที่มีอยู่แล้ว), auto-transition
-- status เป็น disassembling ตอนถอดชิ้นแรก
--
-- ❌ ยังไม่ทำ (ตัวการ์ดเองยังไม่ตัดสินใจหลายจุด บล็อกการเขียนโค้ด/test ตรงๆ):
--  - Cost allocation logic (relative sales value method) — rounding rule ของเศษสตางค์ยังไม่ตัดสินใจ
--    ("Σ allocated_cost ต้อง = purchase_price เป๊ะ" แต่ยังไม่รู้เศษไปลงชิ้นไหน)
--  - แก้ estimated_total_value หลังถอดไปแล้วบางชิ้น — freeze หรือ recalc ยังไม่ตัดสินใจ
--  - "ขายซากที่เหลือเป็นเศษเหล็ก" (sold_whole after partial disassembly) — ยังไม่ตัดสินใจว่า
--    อนุญาตไหม + บันทึกเป็น part_sales ปกติหรือ transaction แยกประเภท
--  - RBAC matrix ละเอียด (ใครสร้าง/ปิดคัน/แก้ราคาประเมินได้) — ใช้ pattern เดียวกับ jobs ไปก่อน
--    (owner/manager/supervisor/technician insert/update, owner/manager delete, ทุก role ดูได้)
--    เป็นการตัดสินใจชั่วคราวของเรา ไม่ใช่มติจากการ์ด — ปรับได้ทีหลังถ้า RBAC ตัดสินใจต่างจากนี้

create table if not exists salvage_vehicles (
  vehicle_id            bigint generated always as identity primary key,
  shop_id                bigint not null references shops(shop_id),
  generation_id           bigint references model_generations(generation_id),
  trim_id                 bigint references model_trims(trim_id),
  chassis_number          text,
  license_plate           text,
  purchase_price          numeric,
  purchase_date           date,
  purchase_source         text,
  zone_id                 uuid references zones(id),
  status                  text not null default 'in_stock'
    check (status in ('in_stock', 'disassembling', 'fully_disassembled', 'sold_whole')),
  estimated_total_value   numeric,
  -- ✅ ตัดสินใจแล้วในการ์ด: บังคับแตกเป็น 4-6 กลุ่มใหญ่ตอน intake (ตัวถัง/เครื่องเกียร์/กระจกไฟ/
  -- เบ็ดเตล็ด ฯลฯ) — เก็บเป็น jsonb array [{label, estimated_value}] เพราะจำนวนกลุ่มไม่ตายตัว (4-6)
  value_groups            jsonb not null default '[]'::jsonb,
  photo_urls              text[] not null default '{}',
  notes                   text,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_salvage_vehicles_shop on salvage_vehicles (shop_id);

alter table salvage_vehicles enable row level security;

drop policy if exists "shop members can view salvage vehicles" on salvage_vehicles;
create policy "shop members can view salvage vehicles" on salvage_vehicles
  for select using (
    is_shop_member(shop_id, array['owner', 'manager', 'supervisor', 'technician', 'assistant'])
  );

drop policy if exists "eligible roles can insert salvage vehicles" on salvage_vehicles;
create policy "eligible roles can insert salvage vehicles" on salvage_vehicles
  for insert with check (
    is_shop_member(shop_id, array['owner', 'manager', 'supervisor', 'technician'])
  );

drop policy if exists "eligible roles can update salvage vehicles" on salvage_vehicles;
create policy "eligible roles can update salvage vehicles" on salvage_vehicles
  for update using (
    is_shop_member(shop_id, array['owner', 'manager', 'supervisor', 'technician'])
  );

drop policy if exists "managers+ can delete salvage vehicles" on salvage_vehicles;
create policy "managers+ can delete salvage vehicles" on salvage_vehicles
  for delete using (
    is_shop_member(shop_id, array['owner', 'manager'])
  );

-- audit trail: ใช้ pattern กลางเดียวกับการ์ด "ขยาย audit_log" ตามที่การ์ดนี้แนะนำไว้ตรงๆ
-- ("ถ้าจะมี RPC สำหรับแก้ไข/ลบ...ควรใช้ audit_log pattern เดียวกับที่กำลังขยายอยู่")
create or replace function update_salvage_vehicles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_salvage_vehicles_updated_at on salvage_vehicles;
create trigger trg_salvage_vehicles_updated_at
  before update on salvage_vehicles
  for each row execute function update_salvage_vehicles_updated_at();

-- fn_audit_row_change() (จากการ์ด "ขยาย audit_log") ต้องรู้จัก salvage_vehicles ด้วย ไม่งั้น
-- record_id/record_uuid จะว่างเปล่า หา log ย้อนกลับตาม vehicle_id ไม่ได้ — เพิ่ม branch ให้
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

drop trigger if exists trg_audit_salvage_vehicles on salvage_vehicles;
create trigger trg_audit_salvage_vehicles
  after insert or delete or update on salvage_vehicles
  for each row execute function fn_audit_row_change();

-- parts.salvage_vehicle_id — pattern เดียวกับ parts.job_id ที่มีอยู่แล้วเป๊ะ
alter table parts add column if not exists salvage_vehicle_id bigint references salvage_vehicles(vehicle_id);
create index if not exists idx_parts_salvage_vehicle on parts (salvage_vehicle_id);

-- auto-transition: ถอดชิ้นแรก (insert part ที่ผูก salvage_vehicle_id) -> status เปลี่ยนเป็น
-- disassembling อัตโนมัติ (เฉพาะตอนยังเป็น in_stock อยู่ — ไม่ทับ status อื่นที่ตั้งไว้แล้ว)
create or replace function auto_start_salvage_disassembly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.salvage_vehicle_id is not null then
    update salvage_vehicles
      set status = 'disassembling'
      where vehicle_id = new.salvage_vehicle_id and status = 'in_stock';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_start_salvage_disassembly on parts;
create trigger trg_auto_start_salvage_disassembly
  after insert on parts
  for each row execute function auto_start_salvage_disassembly();
