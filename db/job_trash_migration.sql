-- ============================================================
-- Migration: ถังขยะสำหรับงาน (soft delete)
--
-- เดิม handleDelete() ใน /jobs/[id] ลบ jobs แบบ hard delete จริง (.delete())
-- เปลี่ยนเป็น soft delete (ตั้ง deleted_at) แล้วทำหน้าถังขยะแยกให้กู้คืน/ลบถาวรทีหลัง
--
-- จุดสำคัญด้าน security ที่ตั้งใจแก้ในไฟล์นี้:
-- RLS policy "eligible roles can update jobs" เดิมอนุญาตถึง technician ให้ update
-- งานได้ ถ้าเปลี่ยน handleDelete เป็นแค่ .update({deleted_at}) เฉยๆ โดยไม่กันเพิ่ม
-- จะกลายเป็นว่า technician "ลบ" งานได้ทั้งที่เดิมทำไม่ได้ (สิทธิ์ลบเดิมจำกัดแค่
-- owner/manager) — จึงเพิ่ม trigger กันเฉพาะคอลัมน์ deleted_at ไว้ระดับ DB โดยเฉพาะ
-- ไม่พึ่งแค่ฝั่งแอป
-- ============================================================

-- ------------------------------------------------------------
-- 1) คอลัมน์ deleted_at
-- ------------------------------------------------------------
alter table jobs add column if not exists deleted_at timestamptz;

create index if not exists idx_jobs_deleted_at on jobs (deleted_at) where deleted_at is not null;

-- ------------------------------------------------------------
-- 2) Trigger กันเฉพาะคอลัมน์ deleted_at — เฉพาะ owner/manager เท่านั้นที่ลบ/กู้คืนได้
--    (ไม่กระทบสิทธิ์แก้ไขฟิลด์อื่นของ technician ที่มีอยู่เดิม)
-- ------------------------------------------------------------
create or replace function guard_jobs_deleted_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.deleted_at is distinct from old.deleted_at) then
    if not is_shop_member(new.shop_id, array['owner', 'manager']) then
      raise exception 'เฉพาะเจ้าของ/ผู้จัดการเท่านั้นที่ลบหรือกู้คืนงานได้';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_jobs_deleted_at on jobs;
create trigger trg_guard_jobs_deleted_at
  before update on jobs
  for each row execute function guard_jobs_deleted_at();

-- ------------------------------------------------------------
-- 3) RLS: งานที่ถูกลบ (deleted_at ไม่ null) มองไม่เห็นในรายการปกติของทุกคน
--    เฉพาะ owner/manager เท่านั้นที่เห็นงานที่ถูกลบได้ (สำหรับหน้าถังขยะ)
-- ------------------------------------------------------------
drop policy if exists "shop members can view jobs" on jobs;
create policy "shop members can view jobs" on jobs
  for select using (
    is_shop_member(shop_id, array['owner', 'manager', 'supervisor', 'technician', 'assistant'])
    and can_view_job(job_id, shop_id)
    and deleted_at is null
  );

drop policy if exists "owners and managers can view trashed jobs" on jobs;
create policy "owners and managers can view trashed jobs" on jobs
  for select using (
    is_shop_member(shop_id, array['owner', 'manager'])
    and deleted_at is not null
  );

-- หมายเหตุ: DELETE policy เดิม "managers+ can delete jobs" ไม่ต้องแก้ — ใช้เป็น
-- ปุ่ม "ลบถาวรจากถังขยะ" (hard delete จริง) ต่อไปได้เลย สิทธิ์ตรงกันอยู่แล้ว
