-- ============================================================
-- การ์ด "เบิกอะไหล่จาก generic stock (quantity > 1) ไปใช้กับงาน — job_parts_used"
-- (Notion page 3a4f39f45649813e9d39f9c612eb8c6b) — 24 ก.ค. 2026
--
-- ต้นตอ: `parts.job_id` เดิม (ใน jobs_schema.sql) รองรับแค่กรณีซื้ออะไหล่มาเฉพาะสำหรับงานนั้น
-- ตั้งแต่แรก — ไม่มีกลไก "เบิกบางส่วนจาก stock ทั่วไป (quantity > 1, job_id เป็น null) ไปใช้กับ
-- งานอื่น" คนละคอนเซปต์กับการขาย (ไม่มีเงินเข้าออก เป็นส่วนหนึ่งของค่าแรง/ค่าซ่อม)
--
-- หลักการ (ยืนยันแล้วในการ์ด): ใช้ pattern เดียวกับการขาย ไม่ split แถว parts — ของที่เบิกไปใช้
-- กับงาน "ออกจากสต็อกไปเลย" เหมือนของที่ขายแล้ว (ติดตั้งในรถลูกค้า ไม่ต้องรู้ zone อีกต่อไป)
-- ต่างจาก Zone-move/โอนข้ามสาขาที่ต้อง split แถวเพราะของที่เหลือยังต้องมี zone_id/branch_id
-- ต่อไป (1 แถวมีค่าเดียว) — ตัด parts.quantity ผ่าน deduct_part_stock RPC เดิม (อะตอมมิกเดียวกับ
-- ที่ใช้ตอนขาย/เบิกของสิ้นเปลืองใส่ job_cost_items) แล้ว insert 1 แถวใน job_parts_used เพื่อ log
-- ไม่สร้างแถว parts ใหม่ ไม่ split
--
-- หมายเหตุ: schema ในการ์ดต้นฉบับเขียน `job_id uuid references jobs(id)` ผิด — jobs.job_id เป็น
-- bigint (generated always as identity, ดู jobs_schema.sql) ไม่ใช่ uuid และไม่มีคอลัมน์ jobs.id
-- เลย แก้ตรงนี้ให้ตรงกับ schema จริง เช่นเดียวกับ used_by ที่ควร reference auth.users(id) (ไม่มี
-- ตาราง public.users ในโปรเจกต์นี้ — ทุกที่ที่เก็บผู้ใช้อ้าง auth.users(id) เหมือนกันหมด เช่น
-- jobs.created_by, part_sales.sold_by)
-- ============================================================

create table if not exists job_parts_used (
  id             uuid primary key default gen_random_uuid(),
  job_id         bigint not null references jobs(job_id),
  part_id        uuid not null references parts(id),
  quantity_used  integer not null check (quantity_used > 0),
  -- snapshot ราคาทุน ณ ตอนเบิก (allocated_cost ถ้ามี ไม่งั้น fallback เป็น price) กันราคาทุน
  -- เปลี่ยนทีหลังแล้วย้อนไปแก้ประวัติงานเก่า — fallback logic เดียวกับที่ใช้ใน
  -- stock_value_cap_allocated_cost_migration.sql (coalesce(allocated_cost, price, 0))
  cost_at_time   numeric,
  used_by        uuid references auth.users(id),
  used_at        timestamptz not null default now()
);

create index if not exists idx_job_parts_used_job on job_parts_used (job_id);
create index if not exists idx_job_parts_used_part on job_parts_used (part_id);

alter table job_parts_used enable row level security;

-- Pattern เดียวกับ RLS ของ job_cost_items (admin_role_migration.sql) — เช็คผ่าน parent jobs.shop_id
-- role ที่อนุญาต: ตรงกับ role ที่เข้าหน้า /jobs/[id] ได้ทั้งหมด (RequireAuth allowedRoles ในหน้า
-- job detail จริง) ตามที่การ์ดขอ "role ไหนทำงานนั้นได้ก็เบิกได้" (technician/assistant รวมด้วย) —
-- field_scanner ไม่รวมอยู่แล้วเพราะเข้าหน้า /jobs/[id] ไม่ได้ตั้งแต่ RequireAuth ชั้นนอกสุด (ดู
-- allowedRoles ใน app/jobs/[id]/page.js) และห้ามขาย/เบิกของตาม field_scanner_role_migration.sql
drop policy if exists "shop members can view parts used on jobs" on job_parts_used;
create policy "shop members can view parts used on jobs" on job_parts_used
  for select using (
    exists (
      select 1 from jobs j
      where j.job_id = job_parts_used.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
    )
  );

drop policy if exists "eligible roles can withdraw parts to jobs" on job_parts_used;
create policy "eligible roles can withdraw parts to jobs" on job_parts_used
  for insert with check (
    exists (
      select 1 from jobs j
      where j.job_id = job_parts_used.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant','admin'])
    )
  );

-- ลบได้เฉพาะ owner/manager (แก้ log ผิดพลาด) — ไม่ได้แปลว่าคืนสต็อกให้อัตโนมัติ (ดูหมายเหตุ
-- "ยังไม่ทำ" ด้านล่าง) แค่ลบแถว log เฉยๆ
drop policy if exists "owner manager can delete job parts used log" on job_parts_used;
create policy "owner manager can delete job parts used log" on job_parts_used
  for delete using (
    exists (
      select 1 from jobs j
      where j.job_id = job_parts_used.job_id
        and is_shop_member(j.shop_id, array['owner','manager'])
    )
  );

comment on table job_parts_used is
  'log การเบิกอะไหล่จาก generic stock (quantity > 1, job_id เป็น null ตอนเบิก) ไปใช้ติดตั้งในงาน
   ซ่อม — คนละกลไกกับ parts.job_id เดิม (ซื้อเฉพาะสำหรับงานตั้งแต่แรก) และคนละกลไกกับการขาย
   (part_sales, มีเงินเข้าออก) ของที่เบิกไปแล้วตัด parts.quantity ถาวรเหมือนขาย ไม่ split แถว.
   ยังไม่รองรับ: คืนสต็อกอัตโนมัติถ้า scope งานเปลี่ยนหลังเบิกไปแล้ว (ยังไม่ได้ออกแบบ — ดูการ์ด
   ต้นฉบับ ต้องคืนมือ/ผ่าน move-part หรือแก้ parts.quantity ตรงๆ ไปก่อน)';
