-- ============================================================
-- Migration: ค้นหารายการค่าใช้จ่ายเก่าที่เคยพิมพ์ไว้ (ค่าแรง/ค่าอะไหล่/อื่นๆ)
-- มาหยิบใช้ซ้ำในงานใหม่ — คนละอันกับการค้นหาของจากสต็อก (ไม่ตัดสต็อก
-- ไม่ auto-fill ราคา/จำนวน เว้นให้กรอกเองเสมอ ดึงมาแค่ description + category)
--
-- ทำเป็น RPC (ไม่ query ตรงจากฝั่งแอป) เพราะต้อง join ข้าม job_cost_items ->
-- jobs เพื่อกรองด้วย shop_id และใส่ is_shop_member guardกันข้ามอู่ (multi-tenant)
-- ไว้ในตัวฟังก์ชันเลย ไม่พึ่งฝั่งแอปอย่างเดียว
-- ============================================================

create or replace function search_cost_item_history(p_shop_id bigint, p_query text)
returns table (description text, category text, last_used_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select jci.description, jci.category, max(jci.created_at) as last_used_at
  from job_cost_items jci
  join jobs j on j.job_id = jci.job_id
  where j.shop_id = p_shop_id
    and is_shop_member(p_shop_id, array['owner', 'manager', 'supervisor', 'technician', 'assistant'])
    and jci.description ilike '%' || p_query || '%'
  group by jci.description, jci.category
  order by last_used_at desc
  limit 8;
$$;

grant execute on function search_cost_item_history(bigint, text) to authenticated;
