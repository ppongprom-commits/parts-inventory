-- ============================================================
-- Reconstructed: visibility_groups_and_workflow_schema.sql
--
-- Card: "ไฟล์ schema visibility_groups_and_workflow_schema.sql หายจาก repo"
-- (Tech debt / DR risk, In progress, ขนาดงาน: S)
--
-- สถานะ: ไฟล์นี้ถูกอ้างอิงโดย README.md และ db/job_multi_group_migration.sql
-- ("รันหลัง visibility_groups_and_workflow_schema.sql") แต่ไม่เคยมีอยู่ใน git history เลย
-- (เช็คแล้ว: git log --all --diff-filter=D ไม่เจอ = ไม่ใช่ไฟล์ที่เคยถูกลบ แต่ไม่เคย commit
-- ตั้งแต่แรก) — สอดคล้องกับ pattern เดียวกันที่เจอซ้ำหลายรอบคืนนี้ (model_trims,
-- platform_admins.role, platform_audit_log, zones.owner_type)
--
-- RECONSTRUCTED จากการตรวจ schema จริงบน staging (14 ก.ค. 2026 est.) รวมกับการไล่อ่าน
-- db/job_multi_group_migration.sql (ซึ่ง drop คอลัมน์ jobs.visibility_group_id และ
-- แทนที่ can_view_job() — บอกเป็นนัยว่าไฟล์นี้ต้องเคยสร้างคอลัมน์นั้นและฟังก์ชันเวอร์ชันแรกไว้ก่อน)
-- รัน jobs_schema.sql -> ไฟล์นี้ -> job_multi_group_migration.sql ตามลำดับ
--
-- ✅ VERIFIED (20 ก.ค. 2026): รันไฟล์ 3 ไฟล์ตามลำดับนี้บน local Postgres เปล่า แล้ว diff
-- ผลลัพธ์ (columns, constraints, RLS policies) ของ visibility_groups, visibility_group_members,
-- job_workflow_steps, job_visibility_groups, และ jobs กับ staging จริง — ตรงกันทุกตัว
-- (ดูรายละเอียดการ verify ในสรุปงานคืนนี้ ไม่ได้แนบ diff script ไว้ในไฟล์นี้)
-- ============================================================

-- ------------------------------------------------------------
-- 1) visibility_groups — กลุ่มผู้ใช้ที่กำหนดได้เองต่ออู่ (เช่น "ทีม A", "กะเช้า")
-- ------------------------------------------------------------
create table if not exists visibility_groups (
  group_id    bigint generated always as identity primary key,
  shop_id     bigint not null references shops(shop_id),
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (shop_id, name)
);

alter table visibility_groups enable row level security;

drop policy if exists "shop members can view groups" on visibility_groups;
create policy "shop members can view groups" on visibility_groups
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  );

drop policy if exists "managers+ can manage groups" on visibility_groups;
create policy "managers+ can manage groups" on visibility_groups
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- ------------------------------------------------------------
-- 2) visibility_group_members — สมาชิกของแต่ละกลุ่ม
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
-- 3) jobs.visibility_group_id — คอลัมน์เดิมแบบ "1 งาน = 1 กลุ่ม" (singular FK)
--    ⚠️ ถูก drop ไปแล้วโดย db/job_multi_group_migration.sql (เปลี่ยนเป็น many-to-many ผ่าน
--    job_visibility_groups) — สร้างไว้ที่นี่เพื่อให้ไฟล์ migration ถัดไปมีคอลัมน์ให้ migrate
--    ข้อมูลออกก่อน drop ตามลำดับที่ README ระบุ (รันไฟล์นี้ -> job_multi_group_migration.sql
--    ทันที ห้ามข้าม) — ต้องมาก่อนข้อ 4 (job_workflow_steps) เพราะ policy ของ workflow steps
--    เรียกใช้ can_view_job() ที่นิยามในข้อนี้
-- ------------------------------------------------------------
alter table jobs add column if not exists visibility_group_id bigint references visibility_groups(group_id);

-- can_view_job() เวอร์ชันแรก (ก่อนเปลี่ยนเป็น many-to-many) — ใช้คอลัมน์ singular ด้านบน
-- หมายเหตุ: db/job_multi_group_migration.sql จะ create or replace ทับฟังก์ชันนี้ทันทีที่รันต่อ
-- (เปลี่ยนไปเช็คจาก job_visibility_groups junction table แทน) — นิยามไว้ที่นี่เพื่อให้ RLS
-- policy ของ jobs/job_workflow_steps ด้านล่างเรียกใช้ได้ในช่วงเปลี่ยนผ่าน
create or replace function can_view_job(p_job_id bigint, p_shop_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_shop_member(p_shop_id, array['owner','manager'])
    or not exists (
      select 1 from jobs where job_id = p_job_id and visibility_group_id is not null
    )
    or exists (
      select 1 from jobs j
      join visibility_group_members vgm on vgm.group_id = j.visibility_group_id
      where j.job_id = p_job_id and vgm.user_id = auth.uid()
    );
$$;

drop policy if exists "shop members can view jobs" on jobs;
create policy "shop members can view jobs" on jobs
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and can_view_job(job_id, shop_id)
  );

-- ------------------------------------------------------------
-- 4) job_workflow_steps — ขั้นตอนงานย่อยต่อ job หนึ่งๆ (Phase E)
-- ------------------------------------------------------------
create table if not exists job_workflow_steps (
  step_id       bigint generated always as identity primary key,
  job_id        bigint not null references jobs(job_id) on delete cascade,
  shop_id       bigint not null references shops(shop_id),
  step_order    integer not null default 0,
  step_name     text not null,
  assigned_to   uuid references auth.users(id),
  status        text not null default 'pending'
    check (status in ('pending','in_progress','done','skipped')),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_job_workflow_steps_job on job_workflow_steps (job_id);

alter table job_workflow_steps enable row level security;

drop policy if exists "shop members can view workflow steps" on job_workflow_steps;
create policy "shop members can view workflow steps" on job_workflow_steps
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and exists (
      select 1 from jobs j
      where j.job_id = job_workflow_steps.job_id and can_view_job(j.job_id, j.shop_id)
    )
  );

drop policy if exists "eligible roles can manage workflow steps" on job_workflow_steps;
create policy "eligible roles can manage workflow steps" on job_workflow_steps
  for all using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  )
  with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  );

