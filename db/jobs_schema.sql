-- ============================================================
-- Jobs (งานเข้าอู่) — แยกจากตาราง parts เพราะมีข้อมูลลูกค้า
-- (ชื่อ/เบอร์โทร) ที่ต้องไม่ปนกับข้อมูลสต็อกอะไหล่ตามหลักการที่ตกลงไว้
-- ============================================================

create table if not exists jobs (
  job_id            bigint generated always as identity primary key,
  shop_id           bigint not null references shops(shop_id),

  -- ข้อมูลลูกค้า (sensitive — อยู่ที่นี่ที่เดียว ไม่ไปปนกับ parts)
  customer_name     text,
  customer_phone    text,

  -- ข้อมูลรถ
  car_brand         text,
  car_model         text,
  car_year_display  text,
  generation_id     bigint references model_generations(generation_id),
  license_plate     text,

  source_type       text, -- รถชน / น้ำท่วม / ประกัน total loss / ซ่อมทั่วไป
  status            text not null default 'received'
    check (status in ('received','in_progress','waiting_parts','completed','delivered','canceled')),

  assigned_to       uuid references auth.users(id), -- ช่างที่รับผิดชอบ
  notes             text,
  photo_urls        text[], -- รูปสภาพรถตอนรับเข้า

  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_jobs_shop on jobs (shop_id);
create index if not exists idx_jobs_status on jobs (shop_id, status);
create index if not exists idx_jobs_assigned on jobs (assigned_to);

-- เชื่อมโยง (ไม่บังคับ) ไปที่อะไหล่ที่ถอดได้จากงานนี้ — เผื่ออยากรู้ว่าอะไหล่ชิ้นไหน
-- มาจากงานไหน โดยไม่ต้องเก็บข้อมูลลูกค้าซ้ำในตาราง parts เลย
alter table parts add column if not exists job_id bigint references jobs(job_id);

-- trigger อัปเดต updated_at อัตโนมัติทุกครั้งที่แก้ไข
create or replace function update_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated_at on jobs;
create trigger trg_jobs_updated_at
  before update on jobs
  for each row execute function update_jobs_updated_at();

-- ============================================================
-- RLS: เหมือน parts — เห็นได้เฉพาะสมาชิกอู่ตัวเอง
-- ============================================================
alter table jobs enable row level security;

create policy "shop members can view jobs" on jobs
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "eligible roles can insert jobs" on jobs
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and is_shop_active(shop_id)
  );

create policy "eligible roles can update jobs" on jobs
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician'])
  );

create policy "managers+ can delete jobs" on jobs
  for delete using (is_shop_member(shop_id, array['owner','manager']));
