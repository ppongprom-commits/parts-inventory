-- การ์ด "Job Assignment Status Tracking — เริ่มงาน/หยุดชั่วคราว/เสร็จงาน ต่อ job ที่ถูก assign"
-- State machine เต็ม: pending(=มอบหมายแล้ว รอเริ่ม) -> in_progress -> on_hold -> in_progress -> done
--
-- ⚠️ Schema drift ที่พบคืนนี้ (แก้ตามกระบวนการกัน drift ใน SOP.md): ทั้งไฟล์นี้คือของที่มีอยู่แล้ว
-- จริงบน staging (คอลัมน์ hold_reason/held_at, constraint, และ trigger functions ทั้ง 2 ตัว) จาก
-- เซสชันก่อนหน้าที่การ์ดนี้ถูก mark "In progress" แต่ไม่เคย commit กลับ repo เลยสักไฟล์ — export
-- กลับให้ตรงของจริงทุกตัวที่นี่ (verify แล้วด้วย pg_get_functiondef/pg_get_triggerdef ตรงกับที่รัน
-- อยู่จริง) เขียนแบบ idempotent ทั้งหมดตามธรรมเนียมโปรเจกต์ — ส่วนที่ทำเพิ่มในรอบนี้คือ "UI" เท่านั้น
-- (ปุ่ม เริ่มงาน/หยุดชั่วคราว/ทำต่อ/เสร็จงาน แทน raw <select>) ดู app/jobs/[id]/page.js

alter table job_workflow_steps add column if not exists hold_reason text;
alter table job_workflow_steps add column if not exists held_at timestamptz;

alter table job_workflow_steps drop constraint if exists job_workflow_steps_status_check;
alter table job_workflow_steps add constraint job_workflow_steps_status_check
  check (status in ('pending', 'in_progress', 'on_hold', 'done', 'skipped'));

alter table job_workflow_steps drop constraint if exists job_workflow_steps_hold_reason_required;
alter table job_workflow_steps add constraint job_workflow_steps_hold_reason_required
  check (status <> 'on_hold' or (hold_reason is not null and btrim(hold_reason) <> ''));

-- สิทธิ์ + ลำดับ state machine บังคับที่ DB layer (ไม่ใช่แค่ UI ซ่อนปุ่ม — บทเรียนจาก TC-205b):
--  - เปลี่ยนสถานะได้เฉพาะคนที่ถูก assign เอง หรือ role owner/manager/supervisor
--  - ห้ามข้ามลำดับ: pending -> in_progress/skipped, in_progress -> on_hold/done/skipped,
--    on_hold -> in_progress/skipped (ตรงกับ test scenario "assigned->done ตรงๆ ต้อง reject")
--  - เข้า on_hold แล้ว auto set held_at = now()
create or replace function enforce_workflow_step_status_transition()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_authorized boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select role into v_role from shop_members
    where shop_id = old.shop_id and user_id = auth.uid() and status = 'active'
    limit 1;

  v_authorized := (old.assigned_to is not null and old.assigned_to = auth.uid())
    or (v_role in ('owner', 'manager', 'supervisor'));

  if v_authorized is not true then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนสถานะขั้นตอนนี้ — เฉพาะคนที่ถูก assign หรือ supervisor ขึ้นไปเท่านั้น';
  end if;

  if not (
    (old.status = 'pending' and new.status in ('in_progress', 'skipped')) or
    (old.status = 'in_progress' and new.status in ('on_hold', 'done', 'skipped')) or
    (old.status = 'on_hold' and new.status in ('in_progress', 'skipped'))
  ) then
    raise exception 'เปลี่ยนสถานะจาก % เป็น % ไม่ได้ (ห้ามข้ามขั้นตอน) — ต้องเปลี่ยนตามลำดับ pending -> in_progress -> on_hold/done', old.status, new.status;
  end if;

  if new.status = 'on_hold' then
    new.held_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_workflow_step_status on job_workflow_steps;
create trigger trg_enforce_workflow_step_status
  before update on job_workflow_steps
  for each row execute function enforce_workflow_step_status_transition();

-- Timestamps อัตโนมัติ: started_at ตอนเข้า in_progress ครั้งแรก, completed_at ตอนเข้า done
-- (เคลียร์ completed_at ถ้าย้ายออกจาก done ภายหลัง — กันเวลาค้างผิดถ้ามีคนแก้สถานะย้อนกลับ)
create or replace function update_job_workflow_step_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.status = 'in_progress' and (old.status is distinct from new.status) and new.started_at is null then
    new.started_at = now();
  end if;

  if new.status = 'done' and (old.status is distinct from new.status) then
    new.completed_at = now();
    if new.started_at is null then
      new.started_at = now();
    end if;
  end if;

  if new.status not in ('done') then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_job_workflow_step_timestamps on job_workflow_steps;
create trigger trg_job_workflow_step_timestamps
  before update on job_workflow_steps
  for each row execute function update_job_workflow_step_timestamps();

-- ยังไม่ตัดสินใจ (ทิ้งไว้ตามการ์ด — ไม่ implement รอบนี้):
--  - ประวัติ on_hold เก็บทุกครั้งเป็น log หรือแค่ครั้งล่าสุด — รอบนี้เก็บแค่ held_at/hold_reason ล่าสุด
--  - job เดียวมีหลายคน assign ต่อ 1 step ได้ไหม — รอบนี้ยังคงเป็น assigned_to เดี่ยวเหมือนเดิม
--  - สถานะ "cancelled" — ไม่ได้เพิ่มรอบนี้ (gap ที่การ์ดเจอตอนเขียน test แต่ยังไม่ตัดสินใจ)
