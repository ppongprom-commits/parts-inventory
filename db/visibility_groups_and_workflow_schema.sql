-- ============================================================
-- db/visibility_groups_and_workflow_schema.sql
--
-- เขียนย้อนหลัง (21 ก.ค. 2569) — ไฟล์นี้เคยถูกอ้างถึงใน README และใน
-- job_multi_group_migration.sql แต่หายไปจาก git ทั้งที่ 3 ตารางนี้มีอยู่จริง
-- บน production (ktfnnmxrochfcjzifjlw) มาก่อนแล้ว — ปิดช่องว่าง schema drift
--
-- Reconstructed จาก pg_policies / pg_proc / list_tables ของจริงบน production
-- ทุกจุด (column, type, default, RLS policy, trigger function) ยกเว้นจุดเดียวคือ
-- RLS ชั้นกลางของ jobs.visibility_group_id (คอลัมน์ทรานเซียนต์ที่ถูกลบไปแล้วใน
-- job_multi_group_migration.sql ก่อนไฟล์นี้จะถูกเขียนย้อนหลัง) — ไม่มีร่องรอยเหลือ
-- ให้ยืนยัน จึงไม่เดา ใส่ไว้แค่ตัวคอลัมน์พอให้ migration ถัดไปรันได้โดยไม่พัง
-- (ไฟล์ถัดไป drop+create policy ทับอยู่แล้วทุกจุดที่เกี่ยว)
--
-- ลำดับการรัน: jobs_schema.sql → (ไฟล์นี้) → job_multi_group_migration.sql
-- Idempotent — รันซ้ำได้ปลอดภัย (create if not exists / drop-then-create policy)
-- ============================================================

-- ------------------------------------------------------------
-- 1) visibility_groups — กลุ่มสำหรับกำหนดว่างานไหนใครเห็นได้บ้าง
-- ------------------------------------------------------------
create table if not exists visibility_groups (
  group_id    bigint generated always as identity primary key,
  shop_id     bigint not null references shops(shop_id),
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table visibility_groups enable row level security;

drop policy if exists "shop members can view groups" on visibility_groups;
create policy "shop members can view groups" on visibility_groups
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

drop policy if exists "managers+ can manage groups" on visibility_groups;
create policy "managers+ can manage groups" on visibility_groups
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- ------------------------------------------------------------
-- 2) visibility_group_members — สมาชิกในแต่ละกลุ่ม
-- ------------------------------------------------------------
create table if not exists visibility_group_members (
  group_id  bigint not null references visibility_groups(group_id) on delete cascade,
  user_id   uuid not null references auth.users(id),
  primary key (group_id, user_id)
);

alter table visibility_group_members enable row level security;

drop policy if exists "shop members can view group members" on visibility_group_members;
create policy "shop members can view group members" on visibility_group_members
  for select using (
    exists (
      select 1 from visibility_groups g
      where g.group_id = visibility_group_members.group_id
        and is_shop_member(g.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  );

drop policy if exists "managers+ can manage group members" on visibility_group_members;
create policy "managers+ can manage group members" on visibility_group_members
  for all using (
    exists (
      select 1 from visibility_groups g
      where g.group_id = visibility_group_members.group_id
        and is_shop_member(g.shop_id, array['owner','manager'])
    )
  )
  with check (
    exists (
      select 1 from visibility_groups g
      where g.group_id = visibility_group_members.group_id
        and is_shop_member(g.shop_id, array['owner','manager'])
    )
  );

-- ------------------------------------------------------------
-- 3) jobs.visibility_group_id — คอลัมน์ทรานเซียนต์ของยุค "1 งาน = 1 กลุ่ม"
--    (job_multi_group_migration.sql จะ backfill เข้า junction table แล้วลบคอลัมน์นี้
--    ทิ้งทันที) ใส่ไว้แค่ให้ migration ถัดไปมี column ให้อ่านตอน backfill ไม่พัง
--    ไม่ต้องตั้ง RLS ของ jobs ที่นี่ เพราะ job_multi_group_migration.sql drop+create
--    policy "shop members can view jobs" ทับอยู่แล้ว
-- ------------------------------------------------------------
alter table jobs add column if not exists visibility_group_id bigint references visibility_groups(group_id);

-- ------------------------------------------------------------
-- 4) job_workflow_steps — ขั้นตอนงานย่อยในแต่ละ job
-- ------------------------------------------------------------
create table if not exists job_workflow_steps (
  step_id       bigint generated always as identity primary key,
  job_id        bigint not null references jobs(job_id) on delete cascade,
  shop_id       bigint not null references shops(shop_id),
  step_order    integer not null default 0,
  step_name     text not null,
  assigned_to   uuid references auth.users(id),
  status        text not null default 'pending'
                check (status in ('pending', 'in_progress', 'done', 'skipped')),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_job_workflow_steps_job on job_workflow_steps (job_id);

alter table job_workflow_steps enable row level security;

-- select policy รุ่นแรก (ยังไม่มี can_view_job เพราะฟังก์ชันนี้เพิ่งถูกสร้างทีหลังใน
-- job_multi_group_migration.sql) — ไฟล์ถัดไป drop+create ทับเป็นรุ่น multi-group เอง
drop policy if exists "shop members can view workflow steps" on job_workflow_steps;
create policy "shop members can view workflow steps" on job_workflow_steps
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

drop policy if exists "eligible roles can manage workflow steps" on job_workflow_steps;
create policy "eligible roles can manage workflow steps" on job_workflow_steps
  for all using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']))
  with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

-- ฟังก์ชัน + trigger: auto set started_at/completed_at/updated_at ตามการเปลี่ยน status
-- (ของจริงตรงกับ production ทุกตัวอักษร ดึงมาจาก pg_get_functiondef บน production)
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
