-- ============================================================
-- Seed: เพิ่มโมเดล/รุ่นย่อยที่ตรวจพบว่าขาดหายไป (ORA, Haval)
-- รันหลัง model_trims_migration.sql เท่านั้น
-- ============================================================

-- ------------------------------------------------------------
-- ORA 5 — model ใหม่ที่ยังไม่มีในระบบ (SUV ต่อจาก Good Cat)
-- ------------------------------------------------------------
insert into models (brand_id, model_name)
  select brand_id, 'ORA 5' from brands where brand_name = 'ORA'
  on conflict (brand_id, model_name) do nothing;

insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note)
  select m.model_id, '2025-ปัจจุบัน', 'SUV ไฟฟ้า/ไฮบริด', 2025, null, true,
         'มีทั้งเวอร์ชัน EV (ไฟฟ้า 100%) และ HEV (ไฮบริด 1.5 เทอร์โบ) — ดูรุ่นย่อยเพื่อแยกระบบขับเคลื่อน'
  from models m join brands b on b.brand_id = m.brand_id
  where b.brand_name = 'ORA' and m.model_name = 'ORA 5'
  on conflict (model_id, generation_code) do nothing;

insert into model_trims (generation_id, trim_name, powertrain_type, note)
  select g.generation_id, trim.name, trim.pt, null
  from model_generations g
  join models m on m.model_id = g.model_id
  join brands b on b.brand_id = m.brand_id
  cross join (values
    ('EV Pro', 'EV'),
    ('EV Ultra', 'EV'),
    ('HEV Pro', 'HEV'),
    ('HEV Ultra', 'HEV')
  ) as trim(name, pt)
  where b.brand_name = 'ORA' and m.model_name = 'ORA 5' and g.generation_code = '2025-ปัจจุบัน'
  on conflict (generation_id, trim_name) do nothing;

-- ------------------------------------------------------------
-- ORA Good Cat — เติมรุ่นย่อยให้ generation ที่มีอยู่แล้ว
-- ------------------------------------------------------------
insert into model_trims (generation_id, trim_name, powertrain_type, note)
  select g.generation_id, trim.name, 'EV', null
  from model_generations g
  join models m on m.model_id = g.model_id
  join brands b on b.brand_id = m.brand_id
  cross join (values ('400 PRO'), ('500 ULTRA'), ('GT')) as trim(name)
  where b.brand_name = 'ORA' and m.model_name = 'Good Cat' and g.generation_code = '2021-ปัจจุบัน'
  on conflict (generation_id, trim_name) do nothing;

-- ------------------------------------------------------------
-- Haval H6 — เติมรุ่นย่อย HEV/PHEV ให้ generation ที่มีอยู่แล้ว
-- ------------------------------------------------------------
insert into model_trims (generation_id, trim_name, powertrain_type, note)
  select g.generation_id, trim.name, trim.pt, null
  from model_generations g
  join models m on m.model_id = g.model_id
  join brands b on b.brand_id = m.brand_id
  cross join (values
    ('HEV PRO', 'HEV'),
    ('PHEV PRO', 'PHEV'),
    ('PHEV ULTRA', 'PHEV')
  ) as trim(name, pt)
  where b.brand_name = 'Haval' and m.model_name = 'H6' and g.generation_code = '2021-ปัจจุบัน'
  on conflict (generation_id, trim_name) do nothing;
