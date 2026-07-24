-- ============================================================
-- Card: "Salvage vehicle cost allocation — edge cases to design for"
-- (page 3a1f39f456498194a822f5d39f7bf608) — edge cases 2 และ 3
--
-- Edge case 2 (เจอของมีค่าที่ไม่ได้ประเมินไว้ตอนแรก): ✅ ตัดสินใจแล้วในการ์ด — estimated_value = null,
-- allocated_cost = 0 (ของแถม ต้นทุน 0 ไม่ trigger recalculation ของอะไหล่ชิ้นอื่นในคันเดียวกันเลย —
-- เข้าเกณฑ์ materiality) หน้า /add (app/add/page.js) รองรับการเว้นว่างช่องมูลค่าประเมินอยู่แล้ว
-- (ส่ง estimated_value: null ถ้าไม่กรอก) แต่ trigger fn_allocate_salvage_part_cost เดิม (จาก
-- db/salvage_vehicle_cost_allocation_migration.sql) แค่ "return new" เฉยๆ เมื่อ estimated_value เป็น
-- null — ปล่อย allocated_cost เป็น null ค้าง ไม่ใช่ 0 ตามที่การ์ดตัดสินใจ (null สื่อว่า "ไม่เกี่ยวกับ
-- salvage เลย" ปนกับ "ของแถมจาก salvage แต่ต้นทุน 0" ไม่ได้ — สอง semantic ต่างกันจริง) — แก้ในไฟล์นี้
--
-- Edge case 3 (ต้นทุนแรงงานถอด/ทำความสะอาดก่อนขาย): ✅ ตัดสินใจแล้วในการ์ด — ออกเป็นใบงานถอด/
-- ทำความสะอาด (work order) แยกต่างหาก เป็น sub-flow ของ salvage vehicle intake/disassembly (ไม่ใช่
-- ระบบแยก) มี scope, estimated_duration, actual_start/actual_end, assigned_to, labor_rate ->
-- labor_cost = เวลาจริง × labor_rate เมื่อปิดงาน (actual_end ถูกเซ็ต) หรือใช้ estimated_duration ×
-- labor_rate เป็นค่าประมาณการชั่วคราวถ้างานยังไม่ปิด — labor_cost รวมเข้า "ฐาน" (purchase_price +
-- labor_cost) ก่อนปันสัดส่วน relative sales value ตาม TAS2/IAS2 ย่อหน้า 14 — จุดที่แก้คือจุดเดียวกับ
-- ที่ fn_allocate_salvage_part_cost คำนวณ allocated_cost อยู่แล้ว (ไม่สร้าง parallel calculation path)
-- ไม่มีการ recalculate อะไหล่ที่คำนวณ allocated_cost ไปแล้วก่อนหน้าย้อนหลัง เมื่อ labor_cost อัปเดต
-- เป็นค่า final ทีหลัง (สอดคล้องกับกฎ "freeze ตั้งแต่เริ่มถอดชิ้นแรก" เดิม — ไม่ใช่ backdoor รอบมัน
-- เพราะ trigger คำนวณ allocated_cost แค่ตอน insert/update แถว part แถวนั้นๆ เท่านั้น ไม่เคยวน
-- recompute แถวอื่นอยู่แล้วโดยธรรมชาติของ design เดิม)
--
-- Edge case 4 (NRV check ตอนปิดงวด) — ❌ ยังไม่ implement ในไฟล์นี้ (out of scope รอบนี้โดยตั้งใจ):
-- ต้องผูกกับ workflow ปิดงวดสิ้นเดือน (accounting_periods) ซึ่งเป็นส่วนหนึ่งของ Accounting Module ที่
-- ยังไม่เริ่มสร้างเลย (ดู SOP.md ข้อ 6 "❌ ยังไม่มี") — blocked on Accounting Module, ไม่ใช่ลืม
-- ============================================================

-- ------------------------------------------------------------
-- 1) salvage_vehicles.labor_cost — ผลรวม labor_cost ของทุก work order ที่ผูกกับคันนี้ (sync
--    อัตโนมัติผ่าน trigger ด้านล่าง ไม่ต้องแก้มือ) ใช้เป็นส่วนหนึ่งของฐานคำนวณ allocation ร่วมกับ
--    purchase_price — ไม่อยู่ในรายการคอลัมน์ที่ถูก freeze โดย fn_freeze_salvage_valuation (ฟังก์ชัน
--    นั้นเช็คเฉพาะ estimated_total_value/value_groups เท่านั้น) จึงอัปเดตได้ตลอดแม้คันจะเข้าสถานะ
--    disassembling ไปแล้ว ตามมติการ์ด ("ปรับเป็นค่าจริงตอน work order ปิด ไม่ต้อง recalc ทันที")
alter table salvage_vehicles add column if not exists labor_cost numeric not null default 0;

comment on column salvage_vehicles.labor_cost is
  'ผลรวมต้นทุนแรงงานถอด/ทำความสะอาด จาก salvage_vehicle_work_orders ทั้งหมดของคันนี้ (provisional
   จาก estimated_duration_hours×labor_rate ถ้า work order ยังเปิดอยู่, final จากเวลาจริงถ้าปิดแล้ว)
   sync อัตโนมัติผ่าน trg_sync_salvage_vehicle_labor_cost — ห้าม update ตรงจาก client';

-- ------------------------------------------------------------
-- 2) work order ถอด/ทำความสะอาด — sub-flow ของ salvage vehicle intake/disassembly (การ์ดระบุตรงๆ
--    ว่า "ไม่ใช่ระบบแยก") ผูกกับ vehicle_id เดียวกับ parts.salvage_vehicle_id
create table if not exists salvage_vehicle_work_orders (
  work_order_id             bigint generated always as identity primary key,
  shop_id                   bigint not null references shops(shop_id),
  vehicle_id                bigint not null references salvage_vehicles(vehicle_id),
  scope                     text not null,
  estimated_duration_hours  numeric not null check (estimated_duration_hours > 0),
  actual_start              timestamptz not null default now(),
  actual_end                timestamptz,
  assigned_to               uuid references auth.users(id),
  labor_rate                numeric not null check (labor_rate >= 0),
  -- provisional (estimated_duration_hours × labor_rate) ตอนสร้าง -> final (เวลาจริง × labor_rate)
  -- ตอนปิดงาน — เขียนโดย create_salvage_work_order()/close_salvage_work_order() RPC เท่านั้น
  labor_cost                numeric not null default 0,
  status                    text not null default 'open' check (status in ('open', 'closed')),
  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_salvage_work_orders_vehicle on salvage_vehicle_work_orders (vehicle_id);
create index if not exists idx_salvage_work_orders_shop on salvage_vehicle_work_orders (shop_id);

alter table salvage_vehicle_work_orders enable row level security;

drop policy if exists "shop members can view salvage work orders" on salvage_vehicle_work_orders;
create policy "shop members can view salvage work orders" on salvage_vehicle_work_orders
  for select using (
    is_shop_member(shop_id, array['owner', 'manager', 'supervisor', 'technician', 'assistant'])
  );

-- insert/update เฉพาะผ่าน RPC (create_salvage_work_order / close_salvage_work_order) เท่านั้น —
-- labor_rate ต้องมี floor เดียวกับ purchase_price/estimated_value (Owner/Manager/Supervisor) และ
-- ต้อง atomic กับการ sync salvage_vehicles.labor_cost (pattern เดียวกับ sell_salvage_vehicle_scrap)
drop policy if exists "no direct insert on salvage work orders" on salvage_vehicle_work_orders;
create policy "no direct insert on salvage work orders" on salvage_vehicle_work_orders
  for insert with check (false);

drop policy if exists "no direct update on salvage work orders" on salvage_vehicle_work_orders;
create policy "no direct update on salvage work orders" on salvage_vehicle_work_orders
  for update using (false);

create or replace function fn_touch_salvage_work_order_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_salvage_work_orders_updated_at on salvage_vehicle_work_orders;
create trigger trg_salvage_work_orders_updated_at
  before update on salvage_vehicle_work_orders
  for each row execute function fn_touch_salvage_work_order_updated_at();

revoke execute on function fn_touch_salvage_work_order_updated_at() from public, anon, authenticated;

-- sync salvage_vehicles.labor_cost = Σ labor_cost ของทุก work order ของคันนั้น ทุกครั้งที่ work
-- order เปลี่ยน (insert/update/delete) — security definer เพราะ role ที่ไม่มีสิทธิ์แก้
-- salvage_vehicles ตรงๆ (เช่น technician ที่แค่ถูก assign) ก็ต้องให้ trigger sync ได้อยู่ดี
create or replace function fn_sync_salvage_vehicle_labor_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_id bigint;
  v_total numeric;
begin
  v_vehicle_id := coalesce(new.vehicle_id, old.vehicle_id);

  select coalesce(sum(labor_cost), 0) into v_total
    from salvage_vehicle_work_orders where vehicle_id = v_vehicle_id;

  update salvage_vehicles set labor_cost = v_total where vehicle_id = v_vehicle_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_salvage_vehicle_labor_cost on salvage_vehicle_work_orders;
create trigger trg_sync_salvage_vehicle_labor_cost
  after insert or update or delete on salvage_vehicle_work_orders
  for each row execute function fn_sync_salvage_vehicle_labor_cost();

revoke execute on function fn_sync_salvage_vehicle_labor_cost() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3) RPC: สร้างใบงาน — labor_cost เริ่มต้นเป็น provisional (estimated_duration_hours × labor_rate)
create or replace function create_salvage_work_order(
  p_vehicle_id bigint,
  p_scope text,
  p_estimated_duration_hours numeric,
  p_assigned_to uuid,
  p_labor_rate numeric
)
returns salvage_vehicle_work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle salvage_vehicles;
  v_caller_role text;
  v_new salvage_vehicle_work_orders;
begin
  select * into v_vehicle from salvage_vehicles where vehicle_id = p_vehicle_id;
  if v_vehicle is null then
    raise exception 'ไม่พบซากรถ vehicle_id=%', p_vehicle_id;
  end if;

  select role into v_caller_role from shop_members
    where shop_id = v_vehicle.shop_id and user_id = auth.uid() and status = 'active'
    limit 1;
  if v_caller_role is null or v_caller_role not in ('owner', 'manager', 'supervisor') then
    raise exception 'ไม่มีสิทธิ์สร้างใบงานถอด/ทำความสะอาดของคันนี้';
  end if;

  if v_vehicle.status in ('fully_disassembled', 'sold_whole') then
    raise exception 'คันนี้ปิดไปแล้ว (status=%) — สร้างใบงานใหม่ไม่ได้', v_vehicle.status;
  end if;

  if p_scope is null or length(trim(p_scope)) = 0 then
    raise exception 'ต้องระบุ scope งาน (รายการ/ชิ้นส่วนที่จะถอด)';
  end if;

  if p_estimated_duration_hours is null or p_estimated_duration_hours <= 0 then
    raise exception 'ต้องระบุระยะเวลาโดยประมาณ (ชั่วโมง) มากกว่า 0';
  end if;

  if p_labor_rate is null or p_labor_rate < 0 then
    raise exception 'ต้องระบุอัตราค่าแรงที่ถูกต้อง (>= 0)';
  end if;

  insert into salvage_vehicle_work_orders (
    shop_id, vehicle_id, scope, estimated_duration_hours, assigned_to, labor_rate,
    labor_cost, status, created_by
  ) values (
    v_vehicle.shop_id, p_vehicle_id, p_scope, p_estimated_duration_hours, p_assigned_to, p_labor_rate,
    round(p_estimated_duration_hours * p_labor_rate, 2), 'open', auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke execute on function create_salvage_work_order(bigint, text, numeric, uuid, numeric) from public, anon;
grant execute on function create_salvage_work_order(bigint, text, numeric, uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- 4) RPC: ปิดใบงาน — labor_cost เปลี่ยนจาก provisional เป็น final (เวลาจริง × labor_rate)
create or replace function close_salvage_work_order(p_work_order_id bigint)
returns salvage_vehicle_work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo salvage_vehicle_work_orders;
  v_caller_role text;
  v_actual_hours numeric;
  v_updated salvage_vehicle_work_orders;
begin
  select * into v_wo from salvage_vehicle_work_orders where work_order_id = p_work_order_id for update;
  if v_wo is null then
    raise exception 'ไม่พบใบงาน work_order_id=%', p_work_order_id;
  end if;

  if v_wo.status = 'closed' then
    raise exception 'ใบงานนี้ปิดไปแล้ว — ปิดซ้ำไม่ได้';
  end if;

  select role into v_caller_role from shop_members
    where shop_id = v_wo.shop_id and user_id = auth.uid() and status = 'active'
    limit 1;
  if v_caller_role is null or v_caller_role not in ('owner', 'manager', 'supervisor') then
    raise exception 'ไม่มีสิทธิ์ปิดใบงานนี้';
  end if;

  v_actual_hours := extract(epoch from (now() - v_wo.actual_start)) / 3600.0;
  if v_actual_hours < 0 then
    v_actual_hours := 0;
  end if;

  update salvage_vehicle_work_orders
    set actual_end = now(),
        status = 'closed',
        labor_cost = round(v_actual_hours * v_wo.labor_rate, 2)
    where work_order_id = p_work_order_id
    returning * into v_updated;

  return v_updated;
end;
$$;

revoke execute on function close_salvage_work_order(bigint) from public, anon;
grant execute on function close_salvage_work_order(bigint) to authenticated;

-- ------------------------------------------------------------
-- 5) fn_allocate_salvage_part_cost — แก้ 2 จุดจาก db/salvage_vehicle_cost_allocation_migration.sql:
--    (a) edge case 2: estimated_value null แต่ผูก salvage_vehicle_id -> allocated_cost = 0 (ไม่ใช่
--        null ค้าง) โดยไม่กระทบ parts ปกติที่ไม่ผูก salvage_vehicle_id เลย (ยัง null เหมือนเดิม)
--    (b) edge case 3: ฐานคำนวณเปลี่ยนจาก purchase_price อย่างเดียว เป็น (purchase_price +
--        labor_cost) — จุดเดียวกับที่คำนวณ allocated_cost อยู่แล้ว ไม่สร้าง path คำนวณคู่ขนาน
create or replace function fn_allocate_salvage_part_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_price numeric;
  v_estimated_total numeric;
  v_labor_cost numeric;
begin
  if new.salvage_vehicle_id is null then
    return new;
  end if;

  -- Edge case 2 (การ์ด "Salvage vehicle cost allocation" — เจอของมีค่าที่ไม่ได้ประเมินไว้ตอนแรก):
  -- ของแถม/bonus find จาก salvage vehicle ไม่กรอก estimated_value -> allocated_cost = 0 เสมอ (ต้นทุน
  -- 0, กำไรเต็มราคาขาย) ไม่ต้อง recalculate อะไหล่ชิ้นอื่นในคันเดียวกันเลย (เข้าเกณฑ์ materiality)
  if new.estimated_value is null then
    new.allocated_cost := 0;
    return new;
  end if;

  -- ข้าม recalculation ถ้า estimated_value ไม่เปลี่ยนจากเดิม (กัน trigger รันซ้ำโดยไม่จำเป็นตอน
  -- update field อื่นของ part ที่ไม่เกี่ยวกับการปันส่วนต้นทุนเลย เช่น แก้ชื่อ/รูป)
  if tg_op = 'UPDATE' and old.estimated_value is not distinct from new.estimated_value
     and old.salvage_vehicle_id is not distinct from new.salvage_vehicle_id then
    return new;
  end if;

  select purchase_price, estimated_total_value, coalesce(labor_cost, 0)
    into v_purchase_price, v_estimated_total, v_labor_cost
    from salvage_vehicles where vehicle_id = new.salvage_vehicle_id;

  if v_purchase_price is null or v_estimated_total is null or v_estimated_total = 0 then
    new.allocated_cost := null;
    return new;
  end if;

  -- Edge case 3: labor_cost (จาก work order ที่ผูกกับคันนี้ ณ ตอนนี้ — provisional ถ้า work order
  -- ยังเปิดอยู่, final ถ้าปิดแล้ว) รวมเข้าฐานคำนวณก่อนปันสัดส่วน ตาม TAS2/IAS2 ย่อหน้า 14 — ใช้ค่า
  -- labor_cost ล่าสุด ณ ตอนคำนวณอะไหล่ชิ้นนี้เท่านั้น ไม่ recalculate อะไหล่ชิ้นอื่นที่คำนวณไปแล้ว
  -- ก่อนหน้าย้อนหลังเมื่อ labor_cost เปลี่ยนค่าทีหลัง (สอดคล้องกับกฎ freeze เดิม)
  new.allocated_cost := round((v_purchase_price + v_labor_cost) * (new.estimated_value / v_estimated_total), 2);
  return new;
end;
$$;

-- (ยังคง revoke execute จาก public/anon/authenticated ไว้เหมือนเดิม — trigger-only function ไม่มี
-- ประโยชน์ให้เรียกตรงเลย, revoke ไปแล้วครั้งแรกใน salvage_vehicle_cost_allocation_migration.sql,
-- create or replace ไม่ล้าง grant เดิม แต่ระบุซ้ำที่นี่เพื่อความชัดเจน/idempotent)
revoke execute on function fn_allocate_salvage_part_cost() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6) sell_salvage_vehicle_scrap — remainder ต้องรวม labor_cost เข้าฐานเดียวกับข้อ 5 ด้วย
--    (purchase_price + labor_cost) - Σ allocated_cost ของอะไหล่จริงที่ถอดไปแล้ว แทนแค่ purchase_price
create or replace function sell_salvage_vehicle_scrap(p_vehicle_id bigint)
returns parts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle salvage_vehicles;
  v_caller_role text;
  v_allocated_so_far numeric;
  v_remainder numeric;
  v_new_part parts;
begin
  select * into v_vehicle from salvage_vehicles where vehicle_id = p_vehicle_id for update;
  if v_vehicle is null then
    raise exception 'ไม่พบซากรถ vehicle_id=%', p_vehicle_id;
  end if;

  select role into v_caller_role from shop_members
    where shop_id = v_vehicle.shop_id and user_id = auth.uid() and status = 'active'
    limit 1;
  if v_caller_role is null or v_caller_role not in ('owner', 'manager', 'supervisor') then
    raise exception 'ไม่มีสิทธิ์ขายซากที่เหลือของคันนี้';
  end if;

  if v_vehicle.status in ('fully_disassembled', 'sold_whole') then
    raise exception 'คันนี้ปิดไปแล้ว (status=%) — ขายเศษเหล็กซ้ำไม่ได้', v_vehicle.status;
  end if;

  if v_vehicle.purchase_price is null then
    raise exception 'คันนี้ไม่มี purchase_price บันทึกไว้ — คำนวณเศษเหล็กไม่ได้';
  end if;

  select coalesce(sum(allocated_cost), 0) into v_allocated_so_far
    from parts where salvage_vehicle_id = p_vehicle_id;

  -- Edge case 3: ฐานรวม labor_cost (provisional/final แล้วแต่สถานะ work order ณ ตอนขายเศษเหล็ก)
  -- เข้าไปด้วย ให้ตรงกับฐานเดียวกับที่ fn_allocate_salvage_part_cost ใช้คำนวณอะไหล่จริงแต่ละชิ้น —
  -- คง invariant เดิมไว้: Σ allocated_cost ทุกแถว (รวมเศษเหล็ก) = purchase_price + labor_cost เป๊ะเสมอ
  v_remainder := (v_vehicle.purchase_price + coalesce(v_vehicle.labor_cost, 0)) - v_allocated_so_far;
  if v_remainder < 0 then
    v_remainder := 0;
  end if;

  insert into parts (
    shop_id, part_name, car_brand, car_model, generation_id, trim_id,
    condition, source_type, status, quantity, price, item_type,
    zone_id, salvage_vehicle_id, allocated_cost, notes
  )
  select
    v_vehicle.shop_id,
    'เศษเหล็ก — ซากรถ #' || v_vehicle.vehicle_id,
    null, null, v_vehicle.generation_id, v_vehicle.trim_id,
    'scrap', 'salvage', 'available', 1, null, 'salvage',
    v_vehicle.zone_id, p_vehicle_id, v_remainder,
    'สร้างอัตโนมัติตอนขายซากที่เหลือ (sell_salvage_vehicle_scrap) — allocated_cost = (purchase_price + labor_cost) - Σ allocated_cost ของอะไหล่จริงที่ถอดไปแล้ว'
  returning * into v_new_part;

  update salvage_vehicles set status = 'fully_disassembled' where vehicle_id = p_vehicle_id;

  return v_new_part;
end;
$$;

revoke execute on function sell_salvage_vehicle_scrap(bigint) from public, anon;
grant execute on function sell_salvage_vehicle_scrap(bigint) to authenticated;

-- ------------------------------------------------------------
-- 7) audit_log coverage สำหรับ salvage_vehicle_work_orders — ใช้ pattern กลางเดียวกับตารางอื่น
--    (fn_audit_row_change จาก db/salvage_vehicle_intake_migration.sql) เพิ่ม branch record_id
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
  elsif TG_TABLE_NAME = 'salvage_vehicle_work_orders' then
    v_record_id := nullif(v_row->>'work_order_id', '')::bigint;
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

drop trigger if exists trg_audit_salvage_work_orders on salvage_vehicle_work_orders;
create trigger trg_audit_salvage_work_orders
  after insert or delete or update on salvage_vehicle_work_orders
  for each row execute function fn_audit_row_change();

-- ------------------------------------------------------------
-- Verification queries (รันมือหลัง apply):
--   select vehicle_id, purchase_price, labor_cost, estimated_total_value from salvage_vehicles
--     where labor_cost > 0;
--   select work_order_id, vehicle_id, scope, status, estimated_duration_hours, labor_rate, labor_cost
--     from salvage_vehicle_work_orders order by created_at desc;
--   select id, part_name, salvage_vehicle_id, estimated_value, allocated_cost from parts
--     where salvage_vehicle_id is not null and estimated_value is null; -- ต้องเห็น allocated_cost=0
-- ------------------------------------------------------------
