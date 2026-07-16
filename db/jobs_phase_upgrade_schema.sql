-- ============================================================
-- Phase A: จัดลำดับรายการ + VAT
-- ============================================================
alter table job_cost_items add column if not exists sort_order integer not null default 0;

alter table jobs add column if not exists vat_type text not null default 'none'
  check (vat_type in ('none', 'vat7'));

-- ============================================================
-- Phase D: แผนภาพรถมาร์กจุดชน (เก็บเป็นพิกัดบนภาพ 3 มุม)
-- รูปแบบ: [{ "view": "front"|"side"|"back", "x": 0.42, "y": 0.63, "note": "รอยบุบ" }, ...]
-- x, y เป็นสัดส่วน 0-1 ของขนาดภาพ (responsive ไม่ผูกกับ pixel ตายตัว)
-- ============================================================
alter table jobs add column if not exists damage_points jsonb not null default '[]'::jsonb;

-- ============================================================
-- Phase B: เอกสาร 3 ประเภท (ใบรับรถ/ใบเสนอราคา/ใบแจ้งหนี้)
-- เก็บแบบ snapshot แช่แข็งข้อมูล ณ ตอนสร้างเอกสาร — แก้ราคาทีหลัง
-- เอกสารเก่าจะไม่เปลี่ยนตาม (เหมือนใบเสนอราคา/ใบแจ้งหนี้ของจริงที่พิมพ์ไปแล้ว)
-- ============================================================
create table if not exists job_documents (
  document_id   bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id),
  job_id        bigint not null references jobs(job_id) on delete cascade,
  doc_type      text not null check (doc_type in ('receipt', 'quotation', 'billing')),
  doc_number    text not null unique,
  snapshot      jsonb not null, -- ข้อมูลลูกค้า+รถ+รายการ+ยอดรวม ณ เวลาที่สร้าง
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_job_documents_job on job_documents (job_id);
create index if not exists idx_job_documents_shop on job_documents (shop_id);

alter table job_documents enable row level security;

create policy "shop members can view documents" on job_documents
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "eligible roles can create documents" on job_documents
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  );

create policy "managers+ can delete documents" on job_documents
  for delete using (is_shop_member(shop_id, array['owner','manager']));

-- ============================================================
-- ฟังก์ชันสร้างเลขที่เอกสาร format YYMM-<timestamp ย่อ> ให้ไม่ชนกัน
-- เรียกจากฝั่งแอปตอนสร้างเอกสารแต่ละครั้ง
-- ============================================================
create or replace function generate_doc_number()
returns text
language plpgsql
as $$
declare
  v_prefix text;
begin
  v_prefix := to_char(now(), 'YYMM');
  return v_prefix || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
end;
$$;

grant execute on function generate_doc_number() to authenticated;
