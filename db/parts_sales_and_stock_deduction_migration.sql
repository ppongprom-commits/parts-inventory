-- ============================================================
-- Feature: ขายอะไหล่ (salvage) + ตัดสต็อกของสิ้นเปลือง (consumable)
-- ============================================================

-- ------------------------------------------------------------
-- 1) ประวัติการขายอะไหล่ถอด (salvage) — เก็บทุกครั้งที่ขาย
--    รองรับขายบางส่วนได้ (เช่น มี 4 ชิ้น ขายทีละ 1-2)
-- ------------------------------------------------------------
create table if not exists part_sales (
  sale_id         bigint generated always as identity primary key,
  part_id         uuid not null references parts(id) on delete cascade,
  shop_id         bigint not null references shops(shop_id),
  quantity_sold   numeric not null default 1,
  sale_price      numeric not null, -- ราคาขายจริงต่อหน่วย (อาจต่างจาก price ที่ตั้งไว้)
  sold_to         text, -- ชื่อ/เบอร์ผู้ซื้อ (ไม่บังคับ)
  sold_by         uuid references auth.users(id),
  sold_at         timestamptz not null default now()
);

create index if not exists idx_part_sales_part on part_sales (part_id);
create index if not exists idx_part_sales_shop on part_sales (shop_id);

alter table part_sales enable row level security;

drop policy if exists "shop members can view sales" on part_sales;
create policy "shop members can view sales" on part_sales
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

drop policy if exists "eligible roles can record sales" on part_sales;
create policy "eligible roles can record sales" on part_sales
  for insert with check (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

drop policy if exists "managers can delete sales" on part_sales;
create policy "managers can delete sales" on part_sales
  for delete using (is_shop_member(shop_id, array['owner','manager']));

-- ------------------------------------------------------------
-- 2) เชื่อมรายการค่าใช้จ่ายในงาน (job_cost_items) กับอะไหล่จริงในสต็อก
--    ใช้ตอนเลือก "ของสิ้นเปลือง" จากสต็อกมาใส่ในงานซ่อม เพื่อตัดสต็อกอัตโนมัติ
-- ------------------------------------------------------------
alter table job_cost_items add column if not exists part_id uuid references parts(id);

-- ------------------------------------------------------------
-- 3) RPC ตัดสต็อกแบบปลอดภัย (กันแข่งกันตัดพร้อมกันจนติดลบ)
--    ใช้ atomic update เดียว ไม่ใช่ select แล้วค่อย update แยก 2 ขั้นตอน
-- ------------------------------------------------------------
create or replace function deduct_part_stock(p_part_id uuid, p_quantity numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_quantity numeric;
begin
  update parts
  set quantity = quantity - p_quantity
  where id = p_part_id
  returning quantity into v_new_quantity;

  if v_new_quantity is null then
    raise exception 'ไม่พบอะไหล่ชิ้นนี้';
  end if;

  if v_new_quantity < 0 then
    raise exception 'จำนวนในสต็อกไม่พอ (เหลือน้อยกว่าที่จะตัด)';
  end if;

  return v_new_quantity;
end;
$$;

grant execute on function deduct_part_stock(uuid, numeric) to authenticated;
