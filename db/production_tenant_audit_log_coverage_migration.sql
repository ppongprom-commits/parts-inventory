-- ============================================================
-- พอร์ตระบบ audit_log ครอบทั้งระบบ (parts/jobs/shop_members/shops/options/zones) มาที่
-- production (ktfnnmxrochfcjzifjlw) — ปรับจาก 3 ไฟล์ของ staging:
--   db/audit_log_parts_coverage_migration.sql
--   db/audit_log_full_coverage_migration.sql
--   db/audit_log_changed_by_user_id_fix_migration.sql
--
-- สิ่งที่ปรับต่างจาก staging: shops trigger เดิมเฝ้าดูคอลัมน์ address/tax_id/phone/
-- company_name/shop_name/force_zone_scan_confirmation — production ไม่มีคอลัมน์
-- force_zone_scan_confirmation (ฟีเจอร์ Zone QR scan enforcement ยังไม่เคย deploy ขึ้น
-- production) จึงตัดคอลัมน์นี้ออกจากรายการที่เฝ้าดู
--
-- ⚠️ แก้ปัญหาความปลอดภัยที่พบระหว่างตรวจสอบ production: policy เดิม "Allow public read
-- audit_log" (USING (true)) เปิดให้ authenticated ทุกคนอ่าน log ของทุกร้านได้หมด — ยืนยันแล้วว่า
-- ไม่กระทบ app/admin/car-data/page.js ที่อ่าน audit_log ของ model_generations (shop_id เป็น null
-- เข้าเงื่อนไข "shop_id is null" ในนโยบายใหม่พอดี ยังใช้งานได้ปกติ)
-- ============================================================

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
-- ไม่มี policy insert/update/delete ให้ authenticated/anon โดยตั้งใจ — append-only โดยธรรมชาติ
-- ของ RLS (ไม่มี policy = ปฏิเสธ default) เขียนได้เฉพาะผ่าน SECURITY DEFINER trigger เท่านั้น

-- ------------------------------------------------------------
-- Generic audit trigger function — ครอบทุกตารางที่ระบุด้านล่าง
-- ------------------------------------------------------------
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

-- ฟังก์ชันนี้ใช้เป็น trigger เท่านั้น ไม่ควรเรียกตรงผ่าน RPC ได้เลย — Postgres grant EXECUTE ให้
-- PUBLIC เป็นค่าเริ่มต้นเสมอตอนสร้างฟังก์ชันใหม่ ต้อง revoke ทิ้งชัดเจน (เจอ pattern เดียวกันนี้แล้ว
-- ครั้งก่อนกับ trigger function อื่นตามที่ README บันทึกไว้ — "revoke การเปิด RPC โดยไม่ตั้งใจของ
-- trigger function")
revoke execute on function fn_audit_row_change() from public, anon, authenticated;

-- parts / jobs / shop_members / options / zones — ครอบทุก insert/update/delete ไม่มีเงื่อนไข
drop trigger if exists trg_audit_parts on parts;
create trigger trg_audit_parts
  after insert or delete or update on parts
  for each row execute function fn_audit_row_change();

drop trigger if exists trg_audit_jobs on jobs;
create trigger trg_audit_jobs
  after insert or delete or update on jobs
  for each row execute function fn_audit_row_change();

drop trigger if exists trg_audit_shop_members on shop_members;
create trigger trg_audit_shop_members
  after insert or delete or update on shop_members
  for each row execute function fn_audit_row_change();

drop trigger if exists trg_audit_options on options;
create trigger trg_audit_options
  after insert or delete or update on options
  for each row execute function fn_audit_row_change();

drop trigger if exists trg_audit_zones on zones;
create trigger trg_audit_zones
  after insert or delete or update on zones
  for each row execute function fn_audit_row_change();

-- shops — เฝ้าดูเฉพาะคอลัมน์ที่มีอยู่จริงบน production (ตัด force_zone_scan_confirmation ออก
-- เทียบกับเวอร์ชัน staging — คอลัมน์นั้นเป็นของฟีเจอร์อื่นที่ยังไม่เคย deploy ขึ้น production)
drop trigger if exists trg_audit_shops on shops;
create trigger trg_audit_shops
  after update of address, tax_id, phone, company_name, shop_name on shops
  for each row execute function fn_audit_row_change();

-- ------------------------------------------------------------
-- ดูประวัติของอะไหล่ชิ้นเดียว — ให้ role ที่ไม่ใช่ owner/manager (technician/assistant) เห็นประวัติ
-- การแก้ไขของ part ที่ตัวเองกำลังดูอยู่ได้ โดยไม่เปิด audit_log ทั้งร้านให้เห็นหมดตาม RLS ด้านบน
-- ------------------------------------------------------------
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

-- revoke จาก public/anon ชัดเจน (เหตุผลเดียวกับ fn_audit_row_change ด้านบน) เหลือแค่ authenticated
-- เรียกได้ — ฟังก์ชันเช็คสิทธิ์ผ่าน is_shop_member() ข้างในอยู่แล้ว แต่ไม่ควรให้ anon เรียกได้ตั้งแต่แรก
revoke execute on function get_part_audit_history(uuid) from public, anon;
grant execute on function get_part_audit_history(uuid) to authenticated;

-- ------------------------------------------------------------
-- แก้ 4 RPC เดิม (ข้อมูลรถ) ให้ใส่ auth.uid() เข้า changed_by_user_id จริง — ตรวจสอบแล้วว่า
-- เวอร์ชันปัจจุบันบน production ไม่เคยใส่ค่านี้เลย (3 แถวเดิมใน audit_log เป็น null หมด)
-- ------------------------------------------------------------
create or replace function insert_model_generation(
  p_model_id           bigint,
  p_generation_code    text,
  p_vehicle_type       text,
  p_year_start         smallint,
  p_year_start_approx  boolean,
  p_year_end           smallint,
  p_year_end_approx    boolean,
  p_is_current         boolean,
  p_note               text,
  p_client_ip          inet,
  p_user_agent         text
) returns model_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new model_generations;
begin
  insert into model_generations (
    model_id, generation_code, vehicle_type,
    year_start, year_start_approx, year_end, year_end_approx,
    is_current, note
  ) values (
    p_model_id, p_generation_code, p_vehicle_type,
    p_year_start, p_year_start_approx, p_year_end, p_year_end_approx,
    p_is_current, p_note
  )
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent, changed_by_user_id)
  values ('model_generations', v_new.generation_id, 'INSERT', null, to_jsonb(v_new), p_client_ip, p_user_agent, auth.uid());

  return v_new;
end;
$$;

create or replace function update_model_generation(
  p_generation_id      bigint,
  p_generation_code    text,
  p_vehicle_type       text,
  p_year_start         smallint,
  p_year_start_approx  boolean,
  p_year_end           smallint,
  p_year_end_approx    boolean,
  p_is_current         boolean,
  p_note               text,
  p_client_ip          inet,
  p_user_agent         text
) returns model_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old model_generations;
  v_new model_generations;
begin
  select * into v_old from model_generations where generation_id = p_generation_id for update;

  update model_generations set
    generation_code   = p_generation_code,
    vehicle_type      = p_vehicle_type,
    year_start        = p_year_start,
    year_start_approx = p_year_start_approx,
    year_end          = p_year_end,
    year_end_approx   = p_year_end_approx,
    is_current        = p_is_current,
    note              = p_note,
    updated_at        = now()
  where generation_id = p_generation_id
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent, changed_by_user_id)
  values ('model_generations', p_generation_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_client_ip, p_user_agent, auth.uid());

  return v_new;
end;
$$;

create or replace function insert_model_trim(
  p_generation_id     bigint,
  p_trim_name         text,
  p_powertrain_type   text,
  p_note              text,
  p_client_ip         inet,
  p_user_agent        text
) returns model_trims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new model_trims;
begin
  insert into model_trims (generation_id, trim_name, powertrain_type, note)
  values (p_generation_id, p_trim_name, p_powertrain_type, p_note)
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent, changed_by_user_id)
  values ('model_trims', v_new.trim_id, 'INSERT', null, to_jsonb(v_new), p_client_ip, p_user_agent, auth.uid());

  return v_new;
end;
$$;

create or replace function update_model_trim(
  p_trim_id           bigint,
  p_trim_name         text,
  p_powertrain_type   text,
  p_note              text,
  p_client_ip         inet,
  p_user_agent        text
) returns model_trims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old model_trims;
  v_new model_trims;
begin
  select * into v_old from model_trims where trim_id = p_trim_id for update;

  update model_trims set
    trim_name        = p_trim_name,
    powertrain_type  = p_powertrain_type,
    note             = p_note,
    updated_at       = now()
  where trim_id = p_trim_id
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent, changed_by_user_id)
  values ('model_trims', p_trim_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_client_ip, p_user_agent, auth.uid());

  return v_new;
end;
$$;

-- create or replace function ไม่ทับ grants ที่มีอยู่แล้ว แต่ใส่ซ้ำไว้กันกรณี fresh install
grant execute on function insert_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;
grant execute on function update_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;
grant execute on function insert_model_trim(bigint, text, text, text, inet, text) to anon, authenticated;
grant execute on function update_model_trim(bigint, text, text, text, inet, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select * from pg_policies where tablename = 'audit_log';
--   select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_audit_%';
-- ------------------------------------------------------------
