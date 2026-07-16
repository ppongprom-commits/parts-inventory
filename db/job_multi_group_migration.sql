-- ============================================================
-- Migration: เปลี่ยน visibility group จาก "1 งาน = 1 กลุ่ม"
-- เป็น "1 งาน = หลายกลุ่มได้" (many-to-many)
-- รันหลัง visibility_groups_and_workflow_schema.sql
-- ============================================================

create table if not exists job_visibility_groups (
  job_id    bigint not null references jobs(job_id) on delete cascade,
  group_id  bigint not null references visibility_groups(group_id) on delete cascade,
  primary key (job_id, group_id)
);

create index if not exists idx_job_visibility_groups_group on job_visibility_groups (group_id);

-- ย้ายข้อมูลเดิม (ถ้ามีงานที่เคยผูกกลุ่มเดียวไว้แล้ว) เข้า junction table ก่อนลบคอลัมน์เก่า
insert into job_visibility_groups (job_id, group_id)
select job_id, visibility_group_id from jobs where visibility_group_id is not null
on conflict do nothing;

alter table jobs drop column if exists visibility_group_id;

-- อัปเดตฟังก์ชันให้เช็คจาก junction table แทน (เช็คว่าอยู่ "กลุ่มใดกลุ่มหนึ่ง" ที่ผูกกับงานนี้ก็พอ)
-- งานที่ไม่ผูกกลุ่มเลย (ไม่มีแถวใน job_visibility_groups) = เห็นได้ทุกคนเหมือนเดิม
create or replace function can_view_job(p_job_id bigint, p_shop_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_shop_member(p_shop_id, array['owner','manager'])
    or not exists (select 1 from job_visibility_groups where job_id = p_job_id)
    or exists (
      select 1 from job_visibility_groups jvg
      join visibility_group_members vgm on vgm.group_id = jvg.group_id
      where jvg.job_id = p_job_id and vgm.user_id = auth.uid()
    );
$$;

-- อัปเดต RLS policy ของ jobs ให้เรียกฟังก์ชันแบบใหม่ (ส่ง job_id แทน visibility_group_id)
drop policy if exists "shop members can view jobs" on jobs;
create policy "shop members can view jobs" on jobs
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and can_view_job(job_id, shop_id)
  );

-- อัปเดต RLS policy ของ job_workflow_steps ให้ตรงกัน
drop policy if exists "shop members can view workflow steps" on job_workflow_steps;
create policy "shop members can view workflow steps" on job_workflow_steps
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and exists (select 1 from jobs j where j.job_id = job_workflow_steps.job_id and can_view_job(j.job_id, j.shop_id))
  );

-- RLS ของ junction table เอง — ดู/แก้ไขได้ตามสิทธิ์เดียวกับงาน
alter table job_visibility_groups enable row level security;

drop policy if exists "shop members can view job groups" on job_visibility_groups;
create policy "shop members can view job groups" on job_visibility_groups
  for select using (
    exists (
      select 1 from jobs j
      where j.job_id = job_visibility_groups.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  );

drop policy if exists "eligible roles can manage job groups" on job_visibility_groups;
create policy "eligible roles can manage job groups" on job_visibility_groups
  for all using (
    exists (
      select 1 from jobs j
      where j.job_id = job_visibility_groups.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  )
  with check (
    exists (
      select 1 from jobs j
      where j.job_id = job_visibility_groups.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  );
