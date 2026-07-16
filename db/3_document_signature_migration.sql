-- ============================================================
-- Migration: เก็บลายเซ็นลูกค้า (เซ็นจากมือถือ) บนใบรับรถ
-- ============================================================

alter table job_documents add column if not exists signature_url text;
alter table job_documents add column if not exists signed_at timestamptz;

-- เดิม job_documents ยังไม่มี policy สำหรับ UPDATE (มีแค่ select/insert/delete)
-- ต้องเพิ่มเพื่อให้บันทึกลายเซ็นทีหลังได้
drop policy if exists "eligible roles can update documents" on job_documents;
create policy "eligible roles can update documents" on job_documents
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  )
  with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
  );
