-- ============================================================
-- Card: "Admin Role (7th role) — สายสำนักงาน + Maker-Checker Approval Config"
-- (Priority: Highest, Not started → this migration)
--
-- Admin = เท่ากับ Supervisor ในระดับ trust tier แต่คนละสาย (Supervisor = field/operations,
-- Admin = office — ข้อมูล/เอกสาร/รายงาน). Hardcode เป็น role ที่ 7 ในทุก enum/CHECK ที่มีอยู่
-- (pattern เดียวกับตอนเพิ่ม field_scanner) — ไม่สร้าง dynamic RBAC เพราะโปรเจกต์ยังไม่ launch
--
-- Scope RLS sweep รอบนี้ (ตาม card): parity กับ supervisor บนตารางที่ admin ต้องใช้จริง — parts,
-- customers, job_cost_items, jobs (view/insert/update, ไม่รวม delete), shops/shop_members
-- (เห็นร้านตัวเอง), shop_field_visibility_overrides (view เท่านั้น). ไม่แตะ: zone/option
-- management, hard-delete parts, delete jobs, invite viewing, field-visibility management —
-- นอกขอบเขตการ์ดนี้. ทุก policy ด้านล่างดึงมาจาก live definition บน staging ตรงๆ (ตรวจสอบผ่าน
-- pg_policies ก่อนเขียน ไม่ใช่เดาจากไฟล์ base schema ที่อาจ drift ไปแล้ว)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Role enum — เพิ่ม 'admin' ในทุก CHECK constraint ที่เกี่ยวกับ role
-- ------------------------------------------------------------
alter table shop_members drop constraint if exists shop_members_role_check;
alter table shop_members add constraint shop_members_role_check
  check (role in ('owner','manager','supervisor','technician','assistant','field_scanner','admin'));

-- shop_invites: เหมือน shop_members ลบ field_scanner ออก (field_scanner สร้างตรงด้วย
-- username+PIN ไม่เคยเชิญทางอีเมล — admin เป็น staff สายสำนักงาน เชิญแบบเดียวกับ manager/supervisor)
alter table shop_invites drop constraint if exists shop_invites_role_check;
alter table shop_invites add constraint shop_invites_role_check
  check (role in ('manager','supervisor','technician','assistant','field_scanner','admin'));

alter table shop_field_visibility_overrides drop constraint if exists shop_field_visibility_overrides_role_check;
alter table shop_field_visibility_overrides add constraint shop_field_visibility_overrides_role_check
  check (role in ('owner','manager','supervisor','technician','assistant','field_scanner','admin'));

-- ------------------------------------------------------------
-- 2. Floor rule: manage_api_keys ล็อกไว้สำหรับ admin เหมือน role อื่นที่ไม่ใช่ owner/manager
--    (floor rule ไม่เปลี่ยนตาม tier — คนละมิติความเสี่ยงกับ field visibility ทั่วไป)
-- ------------------------------------------------------------
create or replace function fn_enforce_field_visibility_floor()
returns trigger
language plpgsql
as $$
begin
  if new.allowed = true then
    if (new.role, new.field_group) in (
      ('field_scanner', 'customer_name'),
      ('field_scanner', 'customer_phone'),
      ('supervisor', 'manage_api_keys'),
      ('technician', 'manage_api_keys'),
      ('assistant', 'manage_api_keys'),
      ('field_scanner', 'manage_api_keys'),
      ('admin', 'manage_api_keys')
    ) then
      raise exception 'Cannot override % for role % above the floor (allowed=false is required)', new.field_group, new.role;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. RLS sweep — เพิ่ม 'admin' เข้า policy array ที่มี 'supervisor' อยู่แล้วบนตารางที่การ์ดนี้
--    ให้สิทธิ์จริง เท่านั้น (ไม่ใช่ทุก policy ที่มี supervisor — ดูหมายเหตุด้านบน)
-- ------------------------------------------------------------

-- parts
drop policy if exists "eligible roles can insert parts" on parts;
create policy "eligible roles can insert parts" on parts
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','field_scanner','admin'])
    and is_shop_active(shop_id)
  );

drop policy if exists "eligible roles can update parts" on parts;
create policy "eligible roles can update parts" on parts
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','field_scanner','admin'])
  );

drop policy if exists "shop members can view parts" on parts;
create policy "shop members can view parts" on parts
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','field_scanner','admin'])
  );

drop policy if exists "estimated_value floor on insert" on parts;
create policy "estimated_value floor on insert" on parts
  for insert with check (
    estimated_value is null or is_shop_member(shop_id, array['owner','manager','supervisor','admin'])
  );

drop policy if exists "estimated_value floor on update" on parts;
create policy "estimated_value floor on update" on parts
  for update with check (
    estimated_value is null or is_shop_member(shop_id, array['owner','manager','supervisor','admin'])
  );

-- shops / shop_members — admin เห็นร้านตัวเองเหมือน member อื่น (ไม่แก้ shop settings)
drop policy if exists "members can view own shop" on shops;
create policy "members can view own shop" on shops
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
  );

drop policy if exists "members can view own row or shop members" on shop_members;
create policy "members can view own row or shop members" on shop_members
  for select using (
    user_id = (select auth.uid())
    or is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
  );

-- customers — card item (3): จัดการข้อมูลลูกค้า (import/แก้ไข)
drop policy if exists "eligible roles can manage customers" on customers;
create policy "eligible roles can manage customers" on customers
  for all using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
  )
  with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
  );

-- job_cost_items — ผูกกับ Job Type Bundle Template (Feature 2) ที่ admin ต้องจัดการเซตได้
drop policy if exists "shop members can view cost items" on job_cost_items;
create policy "shop members can view cost items" on job_cost_items
  for select using (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
    )
  );

drop policy if exists "eligible roles can insert cost items" on job_cost_items;
create policy "eligible roles can insert cost items" on job_cost_items
  for insert with check (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','admin'])
    )
  );

drop policy if exists "eligible roles can update cost items" on job_cost_items;
create policy "eligible roles can update cost items" on job_cost_items
  for update using (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','admin'])
    )
  );

drop policy if exists "eligible roles can delete cost items" on job_cost_items;
create policy "eligible roles can delete cost items" on job_cost_items
  for delete using (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','admin'])
    )
  );

-- jobs — view/insert/update เท่านั้น ไม่แตะ delete (owner/manager only เดิม) และไม่แตะ trashed-view
-- branch (owner/manager only เดิม เหมือน supervisor ก็ไม่เห็น trash)
drop policy if exists "shop members can view jobs (active or trashed)" on jobs;
create policy "shop members can view jobs (active or trashed)" on jobs
  for select using (
    (is_shop_member(shop_id, array['owner','manager']) and deleted_at is not null)
    or (
      is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
      and can_view_job(job_id, shop_id)
      and deleted_at is null
    )
  );

drop policy if exists "eligible roles can insert jobs" on jobs;
create policy "eligible roles can insert jobs" on jobs
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
    and is_shop_active(shop_id)
  );

drop policy if exists "eligible roles can update jobs" on jobs;
create policy "eligible roles can update jobs" on jobs
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','admin'])
  );

-- shop_field_visibility_overrides — view เท่านั้น (management ยังคง owner-only เดิม)
drop policy if exists "shop members can view field visibility overrides" on shop_field_visibility_overrides;
create policy "shop members can view field visibility overrides" on shop_field_visibility_overrides
  for select using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
  );

-- job_documents / part_sale_documents — card item (2): "จัดการเอกสาร/ใบเสร็จ/ใบกำกับภาษี" — ตาราง
-- นี้มีอยู่แล้วจริง (ไม่ใช่การ์ดในอนาคตอย่างที่ข้อความการ์ดชวนเข้าใจผิดตอนแรก) เพิ่ม admin parity
-- กับ supervisor เหมือนกัน ไม่แตะ policy ลบ (managers+ can delete documents — owner/manager เดิม)
drop policy if exists "eligible roles can create documents" on job_documents;
create policy "eligible roles can create documents" on job_documents
  for insert with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "eligible roles can update documents" on job_documents;
create policy "eligible roles can update documents" on job_documents
  for update using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']))
  with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "shop members can view documents" on job_documents;
create policy "shop members can view documents" on job_documents
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "eligible roles can create part sale documents" on part_sale_documents;
create policy "eligible roles can create part sale documents" on part_sale_documents
  for insert with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "shop members can view part sale documents" on part_sale_documents;
create policy "shop members can view part sale documents" on part_sale_documents
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

-- part_sales — card item (1) "ขายอะไหล่" parity กับ supervisor (rolePermissions.js ตั้ง
-- sell_parts: true ให้ admin ไว้แล้ว ต้องมี RLS รองรับจริงไม่งั้นตั้ง flag ไว้เฉยๆ ใช้งานจริงไม่ได้)
-- ไม่แตะ policy ลบ (managers can delete sales — owner/manager เดิม)
drop policy if exists "eligible roles can record sales" on part_sales;
create policy "eligible roles can record sales" on part_sales
  for insert with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "eligible roles can update sales" on part_sales;
create policy "eligible roles can update sales" on part_sales
  for update using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']))
  with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

drop policy if exists "shop members can view sales" on part_sales;
create policy "shop members can view sales" on part_sales
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant','admin']));

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid in ('shop_members'::regclass,'shop_invites'::regclass,
--     'shop_field_visibility_overrides'::regclass) and contype='c';
--   -- ทุกอันควรมี 'admin' ในลิสต์
--   select tablename, policyname, qual, with_check from pg_policies
--   where tablename in ('parts','customers','job_cost_items','jobs','shops','shop_members',
--     'shop_field_visibility_overrides') order by tablename, policyname;
-- ------------------------------------------------------------
