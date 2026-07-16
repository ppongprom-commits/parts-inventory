-- ============================================================
-- Customers — 1 ลูกค้า อาจมีหลายรถ/หลายงานซ่อม เชื่อมด้วย link เดียว
-- ============================================================
create table if not exists customers (
  customer_id   bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id),
  name          text,
  phone         text,
  share_token   uuid not null default gen_random_uuid() unique,
  created_at    timestamptz not null default now(),
  unique (shop_id, phone)
);

create index if not exists idx_customers_shop on customers (shop_id);
create index if not exists idx_customers_share_token on customers (share_token);

-- ผูกงานเข้ากับลูกค้า (nullable — เผื่องานเก่าที่ยังไม่ได้ผูก)
alter table jobs add column if not exists customer_id bigint references customers(customer_id);

-- วันที่ปิดงาน (ซ่อมเสร็จ/ส่งมอบ/ยกเลิก) — ใช้คำนวณกฎการมองเห็น 731 วัน
alter table jobs add column if not exists closed_at timestamptz;

-- trigger: ตั้ง closed_at อัตโนมัติเมื่อ status เปลี่ยนเป็นสถานะปิดงาน
-- และล้างค่าถ้าเปลี่ยนกลับไปเป็นสถานะที่ยังเปิดอยู่ (เผื่อแก้ผิดแล้วย้อนกลับ)
create or replace function update_jobs_closed_at()
returns trigger
language plpgsql
as $$
declare
  closed_statuses text[] := array['completed','delivered','canceled'];
begin
  if new.status = any(closed_statuses) and (old.status is distinct from new.status) then
    new.closed_at = now();
  elsif not (new.status = any(closed_statuses)) then
    new.closed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_closed_at on jobs;
create trigger trg_jobs_closed_at
  before update on jobs
  for each row execute function update_jobs_closed_at();

-- ============================================================
-- Job cost items — รายการค่าใช้จ่าย (ค่าแรง/ค่าอะไหล่/อื่นๆ) ต่องาน
-- ============================================================
create table if not exists job_cost_items (
  item_id       bigint generated always as identity primary key,
  job_id        bigint not null references jobs(job_id) on delete cascade,
  category      text not null check (category in ('labor','parts','other')),
  description   text not null,
  amount        numeric not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_job_cost_items_job on job_cost_items (job_id);

-- ============================================================
-- RLS: customers และ job_cost_items — เห็นได้เฉพาะสมาชิกอู่ (ฝั่งแอดมิน)
-- ฝั่งลูกค้า (public link) เข้าถึงผ่าน API route ที่ใช้ Service Role
-- แยกต่างหาก ไม่ผ่าน RLS พวกนี้เลย
-- ============================================================
alter table customers enable row level security;
alter table job_cost_items enable row level security;

create policy "shop members can view customers" on customers
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "eligible roles can manage customers" on customers
  for all using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']))
  with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "shop members can view cost items" on job_cost_items
  for select using (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  );

create policy "eligible roles can manage cost items" on job_cost_items
  for all using (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician'])
    )
  )
  with check (
    exists (
      select 1 from jobs j
      where j.job_id = job_cost_items.job_id
        and is_shop_member(j.shop_id, array['owner','manager','supervisor','technician'])
    )
  );
