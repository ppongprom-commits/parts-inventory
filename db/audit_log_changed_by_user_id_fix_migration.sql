-- ============================================================
-- Fix: changed_by_user_id ไม่เคยถูกใส่ค่าเลยในทุก RPC ที่เขียนไว้เดิม
--
-- Card: "ขยาย audit_log ให้ครอบทั้งระบบ + ใส่ changed_by_user_id จริง"
-- (Priority: Highest, In progress, ขนาดงาน: L)
--
-- SCOPE ของไฟล์นี้ (คืนนี้ทำเฉพาะส่วนนี้ — ดูหมายเหตุด้านล่าง):
-- แก้บั๊กที่ยืนยันแล้วจากการ์ด — คอลัมน์ changed_by_user_id มีอยู่ใน schema ของ audit_log
-- อยู่แล้ว (รู้แค่ IP/user agent ไม่รู้ว่าเป็น "ใคร" ที่แก้จริง) แก้ 4 RPC เดิมที่มีอยู่แล้ว
-- (insert/update_model_generation, insert/update_model_trim) ให้ส่ง auth.uid() เข้า
-- changed_by_user_id ทุกครั้งที่เขียน log
--
-- ⚠️ NOT IN SCOPE ของไฟล์นี้ (ยังไม่ทำคืนนี้ — ต้องการการตัดสินใจสถาปัตยกรรมที่ยังไม่ชัดก่อน):
-- การขยาย audit trail ให้ครอบ parts/jobs/shop_members/shops/options/zones ทั้งระบบ —
-- การ์ดเองระบุไว้ชัดว่ายังไม่ตัดสินใจระหว่าง trigger-based vs RPC-based
-- ("ต้องเลือกก่อนเพราะกำหนดวิธีเขียน test ทั้งชุด") รวมถึง bulk log strategy และ
-- retention/partitioning ก็ยังไม่ตัดสินใจเช่นกัน — การเดาเลือกสถาปัตยกรรมเองแล้วเขียนโค้ด
-- คลุมทั้งระบบในคืนเดียวโดยไม่มีคนตัดสินใจยืนยันมีความเสี่ยงสูงเกินไปสำหรับงานอัตโนมัติ
-- ตอนกลางคืน — ปล่อยส่วนนี้ไว้เป็น blocked รอ อั้ม ตัดสินใจก่อน
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
