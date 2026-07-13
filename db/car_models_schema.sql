-- ============================================================
-- Thailand Car Models Reference Database — Schema v1
-- (ต่อยอดจาก schema ที่คุณอั้มออกแบบไว้ — เพิ่ม RLS, insert RPC,
--  และ grant execute ให้ครบสำหรับใช้งานจริงผ่าน Supabase JS client)
-- ============================================================

-- ------------------------------------------------------------
-- 1) brands
-- ------------------------------------------------------------
create table if not exists brands (
  brand_id        bigint generated always as identity primary key,
  brand_name      text not null unique,
  country_origin  text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) models
-- ------------------------------------------------------------
create table if not exists models (
  model_id        bigint generated always as identity primary key,
  brand_id        bigint not null references brands(brand_id) on delete restrict,
  model_name      text not null,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (brand_id, model_name)
);

-- ------------------------------------------------------------
-- 3) model_generations — ปีอยู่ตรงนี้ที่เดียว เป็น structured column เสมอ
-- ------------------------------------------------------------
create table if not exists model_generations (
  generation_id      bigint generated always as identity primary key,
  model_id           bigint not null references models(model_id) on delete restrict,
  generation_code    text not null,
  vehicle_type       text,
  year_start         smallint,
  year_start_approx  boolean not null default false,
  year_end           smallint,
  year_end_approx    boolean not null default false,
  is_current         boolean not null default false,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (model_id, generation_code)
);

-- ------------------------------------------------------------
-- 4) VIEW ที่แอปจะดึงมา prefill ช่อง "ปี" เสมอ — user ไม่พิมพ์เอง
-- ------------------------------------------------------------
create or replace view model_generations_display as
select
  g.generation_id,
  b.brand_id,
  b.brand_name,
  m.model_id,
  m.model_name,
  g.generation_code,
  g.vehicle_type,
  concat(
    coalesce(
      (case when g.year_start_approx then '~' else '' end) || g.year_start::text,
      'ไม่ทราบปี'
    ),
    ' - ',
    case
      when g.is_current then 'ปัจจุบัน'
      when g.year_end is null then 'ไม่ทราบปี'
      else (case when g.year_end_approx then '~' else '' end) || g.year_end::text
    end
  ) as year_range_display,
  g.note,
  g.updated_at
from model_generations g
join models m on m.model_id = g.model_id
join brands b on b.brand_id = m.brand_id;

-- ------------------------------------------------------------
-- 5) AUDIT TRAIL
-- ------------------------------------------------------------
create table if not exists audit_log (
  audit_id              bigint generated always as identity primary key,
  table_name            text not null,
  record_id             bigint not null,
  action                text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data              jsonb,
  new_data              jsonb,
  changed_by_ip         inet,
  changed_by_user_agent text,
  changed_by_user_id    uuid,
  changed_at            timestamptz not null default now()
);

create index if not exists idx_audit_log_table_record on audit_log (table_name, record_id);
create index if not exists idx_audit_log_changed_at   on audit_log (changed_at);

-- ============================================================
-- RLS: เปิด RLS ทุกตาราง แต่เปิด "read" ให้ public อย่างเดียว
-- การเขียนทุกครั้งต้องผ่าน RPC (security definer) ด้านล่างเท่านั้น
-- เพื่อบังคับให้ทุก insert/update ของ model_generations ถูกบันทึก
-- audit log เสมอ ไม่มีทางเขียนตรงเข้าตารางแบบข้าม log ได้
-- ============================================================
alter table brands enable row level security;
alter table models enable row level security;
alter table model_generations enable row level security;
alter table audit_log enable row level security;

create policy "Allow public read brands" on brands for select using (true);
create policy "Allow public read models" on models for select using (true);
create policy "Allow public read model_generations" on model_generations for select using (true);
create policy "Allow public read audit_log" on audit_log for select using (true);

-- ============================================================
-- RPC: get_or_create_brand / get_or_create_model
-- ใช้ตอนแอดมินพิมพ์ยี่ห้อ/รุ่นใหม่ที่ยังไม่มีในระบบ
-- (ไม่ต้อง audit เพราะเป็นแค่ taxonomy ไม่ใช่ข้อมูลปีที่ user แก้บ่อย)
-- ============================================================
create or replace function get_or_create_brand(p_brand_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id bigint;
begin
  select brand_id into v_brand_id from brands where brand_name = p_brand_name;
  if v_brand_id is null then
    insert into brands (brand_name) values (p_brand_name) returning brand_id into v_brand_id;
  end if;
  return v_brand_id;
end;
$$;

create or replace function get_or_create_model(p_brand_id bigint, p_model_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id bigint;
begin
  select model_id into v_model_id from models where brand_id = p_brand_id and model_name = p_model_name;
  if v_model_id is null then
    insert into models (brand_id, model_name) values (p_brand_id, p_model_name) returning model_id into v_model_id;
  end if;
  return v_model_id;
end;
$$;

-- ============================================================
-- RPC: insert_model_generation — เพิ่ม generation ใหม่ + audit log
-- ============================================================
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

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_generations', v_new.generation_id, 'INSERT', null, to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

-- ============================================================
-- RPC: update_model_generation — แก้ไข generation + audit log
-- (เหมือนที่คุณอั้มออกแบบไว้ในไฟล์ต้นฉบับ)
-- ============================================================
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

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_generations', p_generation_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

-- ============================================================
-- Grant execute ให้ anon/authenticated เรียก RPC ได้ผ่าน Supabase client
-- (จำเป็น ไม่งั้น PostgREST จะปฏิเสธการเรียกจากฝั่ง browser)
-- ============================================================
grant execute on function get_or_create_brand(text) to anon, authenticated;
grant execute on function get_or_create_model(bigint, text) to anon, authenticated;
grant execute on function insert_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;
grant execute on function update_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;

-- ============================================================
-- เพิ่มคอลัมน์ให้ parts อ้างอิง generation (denormalized copy ของปีไว้โชว์ด้วย
-- เผื่อ generation เดิมถูกแก้ไข/ลบภายหลัง ข้อมูลของอะไหล่ชิ้นนี้จะไม่เปลี่ยนตาม)
-- ============================================================
alter table parts add column if not exists generation_id bigint references model_generations(generation_id);
alter table parts add column if not exists car_year_display text;
