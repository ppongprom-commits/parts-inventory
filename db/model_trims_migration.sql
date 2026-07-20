-- ============================================================
-- Migration: เพิ่มชั้น "รุ่นย่อย" (trim) ให้ car data (staging)
-- โครงสร้างเดิม: brands → models → model_generations (รุ่นใหญ่ + ช่วงปี)
-- เพิ่มเข้ามา:    → model_trims (รุ่นย่อยภายใต้ generation หนึ่งๆ)
--
-- เหตุผลที่แยกจาก model_generations: รุ่นย่อยไม่ใช่แค่ชื่อการตลาด
-- (เช่น GT, ULTRA) แต่บางกรณีคือคนละระบบขับเคลื่อนไปเลย
-- (เช่น ORA 5 EV vs ORA 5 HEV, Haval H6 HEV vs H6 PHEV)
-- ซึ่งกระทบอะไหล่จริง (มอเตอร์ แบตเตอรี่ ถังน้ำมัน ระบบเบรก ฯลฯ)
-- เก็บ powertrain_type แยกเป็นคอลัมน์ตรงๆ เพื่อให้ query/กรองได้ง่าย
-- ไม่ต้องเดาจากชื่อ trim
-- ============================================================

-- ------------------------------------------------------------
-- 1) ตาราง model_trims
-- ------------------------------------------------------------
create table if not exists model_trims (
  trim_id           bigint generated always as identity primary key,
  generation_id     bigint not null references model_generations(generation_id) on delete cascade,
  trim_name         text not null,                 -- เช่น '400 PRO', 'GT', 'HEV PRO', 'PHEV ULTRA'
  powertrain_type   text
    check (powertrain_type in ('EV','HEV','PHEV','ICE') or powertrain_type is null),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (generation_id, trim_name)
);

create index if not exists idx_model_trims_generation on model_trims (generation_id);

-- ------------------------------------------------------------
-- 2) VIEW แสดงผลแบบเต็ม brand › model › generation › trim
--    ให้เห็นชัดเจนว่าแถวนี้คือ "รุ่นย่อย" ของรุ่นใหญ่ไหน ไม่ใช่ model แยก
-- ------------------------------------------------------------
create or replace view model_trims_display as
select
  t.trim_id,
  b.brand_id,
  b.brand_name,
  m.model_id,
  m.model_name,
  g.generation_id,
  g.generation_code,
  gd.year_range_display,
  t.trim_name,
  t.powertrain_type,
  -- ป้ายกำกับพร้อมใช้แสดงผล: "ORA Good Cat (2021-ปัจจุบัน) › GT [EV]"
  concat(
    b.brand_name, ' ', m.model_name,
    ' (', gd.year_range_display, ') › ',
    t.trim_name,
    case when t.powertrain_type is not null then concat(' [', t.powertrain_type, ']') else '' end
  ) as full_label,
  t.note,
  t.updated_at
from model_trims t
join model_generations g on g.generation_id = t.generation_id
join models m on m.model_id = g.model_id
join brands b on b.brand_id = m.brand_id
join model_generations_display gd on gd.generation_id = g.generation_id;

-- ------------------------------------------------------------
-- 3) RLS — อ่านได้ทุกคน เขียนผ่าน RPC เท่านั้น (เหมือน model_generations)
-- ------------------------------------------------------------
alter table model_trims enable row level security;
create policy "Allow public read model_trims" on model_trims for select using (true);

-- ------------------------------------------------------------
-- 4) RPC: insert_model_trim — เพิ่มรุ่นย่อยใหม่ + audit log
-- ------------------------------------------------------------
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

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_trims', v_new.trim_id, 'INSERT', null, to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

-- ------------------------------------------------------------
-- 5) RPC: update_model_trim — แก้ไขรุ่นย่อย + audit log
-- ------------------------------------------------------------
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

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_trims', p_trim_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

grant execute on function insert_model_trim(bigint, text, text, text, inet, text) to anon, authenticated;
grant execute on function update_model_trim(bigint, text, text, text, inet, text) to anon, authenticated;
