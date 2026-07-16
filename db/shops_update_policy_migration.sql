-- ============================================================
-- Migration: เพิ่ม UPDATE policy ให้ตาราง shops
-- (เดิมมีแค่ policy "members can view own shop" ที่เป็น SELECT อย่างเดียว
--  ทำให้ owner/manager กดบันทึกข้อมูลร้าน (ที่อยู่/เลขภาษี/เบอร์โทร) แล้ว
--  ไม่มี error แต่ก็ไม่มีอะไรถูกอัปเดตจริง เพราะ RLS default deny การ UPDATE)
-- ============================================================

drop policy if exists "owner manager can update own shop" on shops;
create policy "owner manager can update own shop" on shops
  for update using (
    is_shop_member(shop_id, array['owner', 'manager'])
  )
  with check (
    is_shop_member(shop_id, array['owner', 'manager'])
  );

-- จำกัดคอลัมน์ที่แก้ไขได้ผ่านช่องทางนี้ไว้แค่ข้อมูลติดต่อ/เอกสาร
-- กันไม่ให้ owner/manager แก้ subscription_status/subscription_plan เองผ่านตรงนี้
-- (เรื่อง subscription ยังต้องผ่าน platform-admin service role เท่านั้น)
revoke update on shops from authenticated;
grant update (address, tax_id, phone) on shops to authenticated;
