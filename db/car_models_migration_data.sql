-- ============================================================
-- Migration: import ข้อมูลรถ 311 รุ่นเดิมจาก carModels.json
-- เข้า schema ใหม่ (brands -> models -> model_generations)
-- รันไฟล์นี้ 'หลังจาก' รัน car_models_schema.sql เรียบร้อยแล้วเท่านั้น
--
-- หมายเหตุการ migrate รอบแรก: ใช้ 1 แถวใน CSV เดิม = 1 model + 1 generation
-- (generation_code ตั้งเป็นช่วงปีไปก่อน) เพื่อไม่ให้เสียข้อมูลเดิมแม้แต่แถวเดียว
-- ต่อจากนี้ค่อยๆ ไปแก้ไข/แยก generation code ให้ละเอียดขึ้นทีหลังผ่านหน้า Admin ได้
-- ============================================================

insert into brands (brand_name) values ('Audi') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'A3' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'แฮทช์แบ็ก/เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'A3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'A4' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'A4' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'A6' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'A6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Q3' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-ปัจจุบัน', 'ครอสโอเวอร์', 2012, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'Q3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Q5' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2009-ปัจจุบัน', 'SUV', 2009, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'Q5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Q7' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2006-ปัจจุบัน', 'SUV', 2006, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'Q7' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Q8 / e-tron' from brands where brand_name = 'Audi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'SUV/EV หรู', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Audi' and m.model_name = 'Q8 / e-tron' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('BMW') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '3-Series' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = '3-Series' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '5-Series' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = '5-Series' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '7-Series' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋งหรู', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = '7-Series' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X1' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'SUV', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X1' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X2' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-ปัจจุบัน', 'ครอสโอเวอร์คูเป้', 2018, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X2' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X3' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-ปัจจุบัน', 'SUV', 2004, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X4' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'SUV คูเป้', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X4' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X5' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-ปัจจุบัน', 'SUV', 2000, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X6' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'SUV คูเป้', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X7' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'SUV', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'X7' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'iX' from brands where brand_name = 'BMW' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'SUV ไฟฟ้า', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BMW' and m.model_name = 'iX' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('BYD') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Atto 3' from brands where brand_name = 'BYD' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BYD' and m.model_name = 'Atto 3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Dolphin' from brands where brand_name = 'BYD' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'แฮทช์แบ็กไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BYD' and m.model_name = 'Dolphin' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Seal' from brands where brand_name = 'BYD' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'เก๋งไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BYD' and m.model_name = 'Seal' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sealion 6' from brands where brand_name = 'BYD' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'ครอสโอเวอร์ไฮบริด/ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BYD' and m.model_name = 'Sealion 6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sealion 7' from brands where brand_name = 'BYD' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'SUV ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'BYD' and m.model_name = 'Sealion 7' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Chevrolet') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Aveo' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2011', 'เก๋ง/แฮทช์แบ็ก', 2003, 2011, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Aveo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Captiva' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2007-2018', 'SUV', 2007, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Captiva' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Colorado' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2020', 'กระบะ', 2004, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Colorado' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Cruze' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-2018', 'เก๋ง', 2010, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Cruze' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Optra' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2011', 'เก๋ง', 2003, 2011, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Optra' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sonic' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2018', 'เก๋ง/แฮทช์แบ็ก', 2012, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Sonic' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Trailblazer' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2020', 'SUV/PPV', 2012, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Trailblazer' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Zafira' from brands where brand_name = 'Chevrolet' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-2008', 'MPV', 1999, 2008, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Chevrolet' and m.model_name = 'Zafira' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Daihatsu') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Charade' from brands where brand_name = 'Daihatsu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1998', 'แฮทช์แบ็ก', 1996, 1998, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Daihatsu' and m.model_name = 'Charade' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mira' from brands where brand_name = 'Daihatsu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1998', 'รถเล็ก', 1996, 1998, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Daihatsu' and m.model_name = 'Mira' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Deepal (ในเครือ Changan)') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'L07' from brands where brand_name = 'Deepal (ในเครือ Changan)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'เก๋งไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Deepal (ในเครือ Changan)' and m.model_name = 'L07' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'S05' from brands where brand_name = 'Deepal (ในเครือ Changan)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Deepal (ในเครือ Changan)' and m.model_name = 'S05' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'S07' from brands where brand_name = 'Deepal (ในเครือ Changan)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Deepal (ในเครือ Changan)' and m.model_name = 'S07' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Ford') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'EcoSport' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-2018', 'ครอสโอเวอร์', 2014, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'EcoSport' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Escape' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2001-2012', 'SUV', 2001, 2012, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Escape' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Everest' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-ปัจจุบัน', 'SUV/PPV', 2003, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Everest' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Fiesta' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-2018', 'เก๋ง/แฮทช์แบ็ก', 2010, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Fiesta' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Focus' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-2018', 'เก๋ง/แฮทช์แบ็ก', 2005, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Focus' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Laser' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2002', 'เก๋ง', 1996, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Laser' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ranger' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-ปัจจุบัน', 'กระบะ', 1999, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Ranger' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Territory' from brands where brand_name = 'Ford' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'ครอสโอเวอร์', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Ford' and m.model_name = 'Territory' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('GAC Aion') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Aion ES' from brands where brand_name = 'GAC Aion' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'เก๋งไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'GAC Aion' and m.model_name = 'Aion ES' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Aion Y Plus' from brands where brand_name = 'GAC Aion' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'GAC Aion' and m.model_name = 'Aion Y Plus' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Haval') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'H6' from brands where brand_name = 'Haval' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'SUV ไฮบริด', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Haval' and m.model_name = 'H6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Jolion' from brands where brand_name = 'Haval' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'ครอสโอเวอร์ไฮบริด', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Haval' and m.model_name = 'Jolion' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Honda') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Accord' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Accord' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'BR-V' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'ครอสโอเวอร์/MPV 7 ที่นั่ง', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'BR-V' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Brio' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-2016', 'แฮทช์แบ็ก อีโคคาร์', 2011, 2016, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Brio' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Brio Amaze' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-2016', 'เก๋ง อีโคคาร์', 2013, 2016, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Brio Amaze' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CR-V' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'CR-V' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'City (DA/DB, gen 6-7)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'เก๋ง', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'City (DA/DB, gen 6-7)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'City (GA3)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2002', 'เก๋ง', 1996, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'City (GA3)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'City (GM2)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2008-2014', 'เก๋ง', 2008, 2014, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'City (GM2)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'City (GM6)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-2019', 'เก๋ง', 2014, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'City (GM6)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'City (T/Vios-rival)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2002-2008', 'เก๋ง', 2002, 2008, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'City (T/Vios-rival)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (EG/EK)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2000', 'เก๋ง/แฮทช์แบ็ก', 1996, 2000, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (EG/EK)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (ES/Dimension)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-2005', 'เก๋ง', 2000, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (ES/Dimension)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (FB)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2016', 'เก๋ง', 2012, 2016, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (FB)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (FC)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-2021', 'เก๋ง', 2016, 2021, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (FC)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (FD)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-2011', 'เก๋ง', 2005, 2011, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (FD)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Civic (FE, gen 11)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'เก๋ง', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Civic (FE, gen 11)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Elysion' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2013', 'MPV (นำเข้าอิสระ)', 2004, 2013, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Elysion' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Freed' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2009-2016', 'MPV', 2009, 2016, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Freed' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'HR-V (Gen1)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-2003', 'ครอสโอเวอร์', 1999, 2003, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'HR-V (Gen1)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'HR-V (Vezel-based)' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'ครอสโอเวอร์', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'HR-V (Vezel-based)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Insight' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-2014', 'ไฮบริด (นำเข้าอิสระ/จำนวนน้อย)', 2000, 2014, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Insight' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Integra' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ต้นยุค 2000', 'สปอร์ต/คูเป้', 1996, null, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Integra' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Jazz' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2021', 'แฮทช์แบ็ก', 2003, 2021, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Jazz' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mobilio' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-2019', 'MPV', 2014, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Mobilio' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Odyssey' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2001-2008', 'MPV', 2001, 2008, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Odyssey' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Prelude' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2001', 'คูเป้สปอร์ต', 1996, 2001, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Prelude' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'S2000' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-2009', 'สปอร์ต โรดสเตอร์', 1999, 2009, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'S2000' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Stepwgn / Step WGN' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'MPV (นำเข้าอิสระ)', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Stepwgn / Step WGN' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Stream' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2001-2006', 'MPV', 2001, 2006, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'Stream' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'WR-V' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'ครอสโอเวอร์', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'WR-V' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'e:N1' from brands where brand_name = 'Honda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'EV', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Honda' and m.model_name = 'e:N1' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Hyundai') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Accent' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2015', 'เก๋ง', 1996, 2015, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Accent' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Creta' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'ครอสโอเวอร์', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Creta' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Elantra' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2020', 'เก๋ง', 1996, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Elantra' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'H-1' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'แวน', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'H-1' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ioniq 5' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'SUV ไฟฟ้า', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Ioniq 5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ioniq 6' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'เก๋งไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Ioniq 6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Staria' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'แวน', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Staria' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Tucson' from brands where brand_name = 'Hyundai' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'SUV', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Hyundai' and m.model_name = 'Tucson' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('IM (ในเครือ SAIC)') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'IM5' from brands where brand_name = 'IM (ในเครือ SAIC)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2025-ปัจจุบัน', 'เก๋ง EV หรู', 2025, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'IM (ในเครือ SAIC)' and m.model_name = 'IM5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'IM6' from brands where brand_name = 'IM (ในเครือ SAIC)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2025-ปัจจุบัน', 'SUV EV หรู', 2025, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'IM (ในเครือ SAIC)' and m.model_name = 'IM6' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Isuzu') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'D-Max (Gen 1)' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2002-2011', 'กระบะ', 2002, 2011, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'D-Max (Gen 1)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'D-Max (Gen 2)' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-2019', 'กระบะ', 2011, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'D-Max (Gen 2)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'D-Max (Gen 3)' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'กระบะ', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'D-Max (Gen 3)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'D-Max EV / Spark BEV' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2025-ปัจจุบัน', 'กระบะไฟฟ้า', 2025, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'D-Max EV / Spark BEV' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Faster' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2002', 'กระบะ', 1996, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'Faster' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MU-7' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2013', 'SUV/PPV', 2004, 2013, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'MU-7' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MU-X' from brands where brand_name = 'Isuzu' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'SUV/PPV', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Isuzu' and m.model_name = 'MU-X' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Jaecoo (ในเครือ Chery)') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Jaecoo J7' from brands where brand_name = 'Jaecoo (ในเครือ Chery)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'SUV', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Jaecoo (ในเครือ Chery)' and m.model_name = 'Jaecoo J7' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Jeep') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Cherokee / Grand Cherokee' from brands where brand_name = 'Jeep' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Jeep' and m.model_name = 'Cherokee / Grand Cherokee' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Compass' from brands where brand_name = 'Jeep' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-ปัจจุบัน', 'ครอสโอเวอร์', 2018, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Jeep' and m.model_name = 'Compass' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Wrangler' from brands where brand_name = 'Jeep' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV ออฟโรด', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Jeep' and m.model_name = 'Wrangler' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Kia') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Bongo' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'กระบะเชิงพาณิชย์', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'Bongo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Carnival' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2006-2020', 'MPV', 2006, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'Carnival' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'EV6' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'เก๋งไฟฟ้า', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'EV6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'EV9' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'SUV ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'EV9' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Grand Carnival' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-2020', 'MPV', 2015, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'Grand Carnival' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Seltos' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'Seltos' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sportage' from brands where brand_name = 'Kia' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'SUV', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Kia' and m.model_name = 'Sportage' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Land Rover') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Defender' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV ออฟโรดหรู', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Defender' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Discovery / Discovery Sport' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-ปัจจุบัน', 'SUV', 1998, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Discovery / Discovery Sport' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Range Rover' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV หรู', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Range Rover' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Range Rover Evoque' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-ปัจจุบัน', 'ครอสโอเวอร์หรู', 2011, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Range Rover Evoque' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Range Rover Sport' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'SUV หรู', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Range Rover Sport' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Range Rover Velar' from brands where brand_name = 'Land Rover' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2017-ปัจจุบัน', 'SUV หรู', 2017, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Land Rover' and m.model_name = 'Range Rover Velar' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Lexus') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'ES' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'เก๋ง หรู', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'ES' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'IS' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'เก๋งหรู', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'IS' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'LX' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'SUV หรู', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'LX' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'NX' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-ปัจจุบัน', 'SUV หรู', 2014, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'NX' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'RX' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'SUV หรู', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'RX' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'UX' from brands where brand_name = 'Lexus' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'ครอสโอเวอร์หรู', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Lexus' and m.model_name = 'UX' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('MG') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '4 Electric' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'แฮทช์แบ็กไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = '4 Electric' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Cyberster' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'โรดสเตอร์ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'Cyberster' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'EP' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'แวนไฟฟ้า', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'EP' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'ES' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2025-ปัจจุบัน', 'เก๋ง EV', 2025, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'ES' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Extender' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'กระบะ', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'Extender' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'HS' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'SUV', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'HS' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MG3' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'แฮทช์แบ็ก', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'MG3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MG5' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'เก๋ง', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'MG5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MG6' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-2018', 'เก๋ง', 2014, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'MG6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Maxus 7' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'แวนไฟฟ้า 7 ที่นั่ง', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'Maxus 7' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Maxus 9' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'แวนไฟฟ้าหรู', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'Maxus 9' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'VS HEV' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'SUV ไฮบริด', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'VS HEV' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'ZS' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2017-ปัจจุบัน', 'ครอสโอเวอร์', 2017, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'ZS' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'ZS EV' from brands where brand_name = 'MG' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MG' and m.model_name = 'ZS EV' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('MINI') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Cooper' from brands where brand_name = 'MINI' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'แฮทช์แบ็ก', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MINI' and m.model_name = 'Cooper' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Countryman' from brands where brand_name = 'MINI' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-ปัจจุบัน', 'ครอสโอเวอร์', 2011, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'MINI' and m.model_name = 'Countryman' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Mazda') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '323' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1998', 'เก๋ง', 1996, 1998, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = '323' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '626' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2002', 'เก๋ง D-segment', 1996, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = '626' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'B-Series' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2006', 'กระบะ', 1998, 2006, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'B-Series' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'BT-50' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2006-ปัจจุบัน', 'กระบะ', 2006, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'BT-50' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CX-3' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'ครอสโอเวอร์', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'CX-3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CX-30' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'ครอสโอเวอร์', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'CX-30' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CX-5' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-ปัจจุบัน', 'SUV', 2012, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'CX-5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CX-8' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-ปัจจุบัน', 'SUV 7 ที่นั่ง', 2018, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'CX-8' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CX-9' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-2023', 'SUV', 2016, 2023, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'CX-9' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'MX-5' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'โรดสเตอร์', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'MX-5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mazda2 (เก๋ง/แฮทช์แบ็ก)' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2009-ปัจจุบัน', 'เก๋ง/แฮทช์แบ็ก อีโคคาร์', 2009, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'Mazda2 (เก๋ง/แฮทช์แบ็ก)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mazda3' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-ปัจจุบัน', 'เก๋ง/แฮทช์แบ็ก', 2004, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'Mazda3' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mazda6' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2002-ปัจจุบัน', 'เก๋ง D-segment', 2002, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'Mazda6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Protégé' from brands where brand_name = 'Mazda' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2002', 'เก๋ง', 1998, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mazda' and m.model_name = 'Protégé' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Mercedes-Benz') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'A-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'เก๋ง/แฮทช์แบ็ก', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'A-Class' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'B-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2020', 'แฮทช์แบ็ก', 2012, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'B-Class' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'C-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'C-Class' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CLA' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-ปัจจุบัน', 'เก๋งคูเป้', 2014, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'CLA' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'CLS' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'เก๋งคูเป้หรู', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'CLS' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'E-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'E-Class' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'EQA / EQB / EQE / EQS' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'EV หรู', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'EQA / EQB / EQE / EQS' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'G-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV ออฟโรดหรู', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'G-Class' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GLA' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'SUV', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'GLA' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GLC' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'SUV', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'GLC' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GLE' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2008-ปัจจุบัน', 'SUV', 2008, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'GLE' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'S-Class' from brands where brand_name = 'Mercedes-Benz' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง หรู', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mercedes-Benz' and m.model_name = 'S-Class' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Mitsubishi') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Attrage' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'เก๋ง อีโคคาร์', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Attrage' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Delica D:5' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2007-ปัจจุบัน', 'MPV (นำเข้าอิสระ)', 2007, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Delica D:5' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Galant' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'เก๋ง', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Galant' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Lancer (GLXi/Champ/Cedia/EX)' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2014', 'เก๋ง', 1996, 2014, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Lancer (GLXi/Champ/Cedia/EX)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mirage' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-ปัจจุบัน', 'แฮทช์แบ็ก อีโคคาร์', 2012, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Mirage' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Outlander' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2018', 'SUV', 2003, 2018, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Outlander' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Outlander PHEV' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-2024', 'SUV ปลั๊กอินไฮบริด', 2020, 2024, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Outlander PHEV' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Pajero' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2006', 'SUV', 1996, 2006, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Pajero' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Pajero Sport' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2008-ปัจจุบัน', 'SUV/PPV', 2008, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Pajero Sport' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Space Wagon' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2011', 'MPV', 2003, 2011, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Space Wagon' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Strada' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1998', 'กระบะ', 1996, 1998, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Strada' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Strada G-Wagon' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2005', 'กระบะ', 1998, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Strada G-Wagon' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Triton' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'กระบะ', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Triton' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Xforce' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2025-ปัจจุบัน', 'ครอสโอเวอร์', 2025, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Xforce' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Xpander' from brands where brand_name = 'Mitsubishi' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-ปัจจุบัน', 'MPV', 2018, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Mitsubishi' and m.model_name = 'Xpander' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Neta (Hozon)') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Neta V' from brands where brand_name = 'Neta (Hozon)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'แฮทช์แบ็กไฟฟ้า', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Neta (Hozon)' and m.model_name = 'Neta V' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Neta X' from brands where brand_name = 'Neta (Hozon)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'ครอสโอเวอร์ไฟฟ้า', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Neta (Hozon)' and m.model_name = 'Neta X' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Nissan') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Almera (N15/N16)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-2003', 'เก๋ง', 2000, 2003, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Almera (N15/N16)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Almera (N17) อีโคคาร์' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-2019', 'เก๋ง', 2011, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Almera (N17) อีโคคาร์' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Almera (N18 เทอร์โบ)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'เก๋ง', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Almera (N18 เทอร์โบ)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Cefiro' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2003', 'เก๋งหรู D-segment', 1996, 2003, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Cefiro' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Elgrand' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1997-ปัจจุบัน', 'MPV (นำเข้าอิสระ/เกรย์มาร์เก็ต)', 1997, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Elgrand' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Fuga' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2019', 'เก๋งหรู (นำเข้าอิสระ)', 2004, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Fuga' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GT-R' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'สปอร์ต', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'GT-R' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Juke' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2011-2019', 'ครอสโอเวอร์', 2011, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Juke' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Kicks (e-POWER)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Kicks (e-POWER)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Leaf' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'EV', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Leaf' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'March' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-2019', 'แฮทช์แบ็ก อีโคคาร์', 2010, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'March' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'NV' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1997-2010', 'กระบะเล็ก', 1997, 2010, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'NV' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'NV1200' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-2015', 'กระบะเล็ก', 2010, 2015, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'NV1200' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Navara (BigM/D22/D40/NP300/D23)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1997-ปัจจุบัน', 'กระบะ', 1997, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Navara (BigM/D22/D40/NP300/D23)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Note (e-POWER)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-2024', 'แฮทช์แบ็ก', 2021, 2024, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Note (e-POWER)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Pulsar' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'เก๋ง', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Pulsar' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Serena' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'MPV', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Serena' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Skyline / GT-R (เจนเนอเรชันเก่า JDM)' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2007', 'สปอร์ต (นำเข้าอิสระ)', 1996, 2007, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Skyline / GT-R (เจนเนอเรชันเก่า JDM)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sunny' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2000', 'เก๋ง', 1996, 2000, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Sunny' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sunny Neo' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2006', 'เก๋ง', 2003, 2006, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Sunny Neo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sylphy' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'เก๋ง', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Sylphy' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Teana' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2020', 'เก๋ง D-segment', 2004, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Teana' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Terra' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-ปัจจุบัน', 'SUV/PPV', 2018, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Terra' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Tiida' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2006-2013', 'แฮทช์แบ็ก', 2006, 2013, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Tiida' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Tiida Latio' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2007-2013', 'เก๋ง', 2007, 2013, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Tiida Latio' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Urvan' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'แวนเชิงพาณิชย์', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'Urvan' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X-Trail' from brands where brand_name = 'Nissan' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2002-ปัจจุบัน', 'SUV', 2002, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Nissan' and m.model_name = 'X-Trail' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('ORA') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Good Cat' from brands where brand_name = 'ORA' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'แฮทช์แบ็กไฟฟ้า', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'ORA' and m.model_name = 'Good Cat' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Omoda (ในเครือ Chery)') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Omoda 5' from brands where brand_name = 'Omoda (ในเครือ Chery)' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'ครอสโอเวอร์', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Omoda (ในเครือ Chery)' and m.model_name = 'Omoda 5' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Peugeot') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '206' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-2008', 'แฮทช์แบ็ก', 1999, 2008, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '206' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '3008' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'ครอสโอเวอร์', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '3008' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '306' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2002', 'เก๋ง/แฮทช์แบ็ก', 1996, 2002, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '306' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '405' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2000', 'เก๋ง', 1996, 2000, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '405' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '406' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2004', 'เก๋ง', 1996, 2004, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '406' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '5008' from brands where brand_name = 'Peugeot' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'SUV 7 ที่นั่ง', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Peugeot' and m.model_name = '5008' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Porsche') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '718 Cayman / Boxster' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'สปอร์ต', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = '718 Cayman / Boxster' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, '911' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'สปอร์ต', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = '911' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Cayenne' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-ปัจจุบัน', 'SUV หรู', 2003, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = 'Cayenne' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Macan' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2014-ปัจจุบัน', 'SUV หรู', 2014, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = 'Macan' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Panamera' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'เก๋งหรู', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = 'Panamera' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Taycan' from brands where brand_name = 'Porsche' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'EV หรู', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Porsche' and m.model_name = 'Taycan' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Proton') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Persona' from brands where brand_name = 'Proton' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'เก๋ง', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Proton' and m.model_name = 'Persona' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Saga' from brands where brand_name = 'Proton' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'เก๋ง', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Proton' and m.model_name = 'Saga' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X50' from brands where brand_name = 'Proton' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Proton' and m.model_name = 'X50' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X70' from brands where brand_name = 'Proton' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'SUV', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Proton' and m.model_name = 'X70' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('SsangYong') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Korando' from brands where brand_name = 'SsangYong' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2010', 'SUV', 1996, 2010, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'SsangYong' and m.model_name = 'Korando' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Musso' from brands where brand_name = 'SsangYong' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2010', 'กระบะ/SUV', 1996, 2010, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'SsangYong' and m.model_name = 'Musso' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Subaru') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'BRZ' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-ปัจจุบัน', 'สปอร์ตคูเป้', 2012, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'BRZ' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Forester' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1997-ปัจจุบัน', 'SUV', 1997, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'Forester' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Impreza' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง/แฮทช์แบ็ก', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'Impreza' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Outback' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-ปัจจุบัน', 'SUV/วากอน', 2000, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'Outback' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'WRX / Legacy' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋งสมรรถนะสูง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'WRX / Legacy' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'XV' from brands where brand_name = 'Subaru' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2025', 'ครอสโอเวอร์', 2012, 2025, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Subaru' and m.model_name = 'XV' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Suzuki') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Caribian' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'SUV เล็ก', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Caribian' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Carry' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'กระบะ/แวนเชิงพาณิชย์', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Carry' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Celerio' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-2020', 'แฮทช์แบ็ก อีโคคาร์', 2015, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Celerio' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ciaz' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'เก๋ง อีโคคาร์', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Ciaz' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ertiga' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'MPV', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Ertiga' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Jimny' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'SUV เล็ก', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Jimny' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Swift' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-ปัจจุบัน', 'แฮทช์แบ็ก', 2012, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Swift' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Vitara' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'SUV เล็ก', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'Vitara' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'XL7' from brands where brand_name = 'Suzuki' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์ MPV', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Suzuki' and m.model_name = 'XL7' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Tank') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Tank 300' from brands where brand_name = 'Tank' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'SUV ปลั๊กอินไฮบริด', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Tank' and m.model_name = 'Tank 300' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Tata') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Xenon' from brands where brand_name = 'Tata' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2008-2019', 'กระบะ', 2008, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Tata' and m.model_name = 'Xenon' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Thai Rung') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Adventure' from brands where brand_name = 'Thai Rung' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2010', 'SUV ดัดแปลง', 1998, 2010, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Thai Rung' and m.model_name = 'Adventure' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Allroader' from brands where brand_name = 'Thai Rung' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2005', 'SUV ดัดแปลง', 1996, 2005, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Thai Rung' and m.model_name = 'Allroader' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Toyota') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, '86' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2017', 'สปอร์ต', 2012, 2017, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = '86' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Alphard' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2009-ปัจจุบัน', 'แวน/MPV หรู', 2009, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Alphard' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Avanza' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'MPV', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Avanza' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'C-HR' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2018-2023', 'ครอสโอเวอร์', 2018, 2023, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'C-HR' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Camry' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1993-1999', 'เก๋ง', 1993, 1999, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Camry' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Camry' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1999-ปัจจุบัน', 'เก๋ง', 1999, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Camry' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Celica' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ต้นยุค 2000', 'สปอร์ต/คูเป้', 1996, null, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Celica' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Century' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋งหรูระดับสูงสุด (นำเข้าอิสระ)', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Century' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Commuter / HiAce' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1992-ปัจจุบัน', 'แวนเชิงพาณิชย์', 1992, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Commuter / HiAce' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Corolla (AE100/AE111)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2001', 'เก๋ง', 1996, 2001, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Corolla (AE100/AE111)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Corolla Altis' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2001-ปัจจุบัน', 'เก๋ง', 2001, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Corolla Altis' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Corolla Cross' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Corolla Cross' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Corona / Toyopet Tiara' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1999', 'เก๋ง', 1996, 1999, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Corona / Toyopet Tiara' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Cressida' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ต้นยุค 2000', 'เก๋ง', 1996, null, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Cressida' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Estima' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-2016', 'MPV (นำเข้าอิสระ/เกรย์มาร์เก็ต)', 2000, 2016, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Estima' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Fortuner' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-ปัจจุบัน', 'SUV/PPV', 2005, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Fortuner' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GR Corolla' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'สปอร์ต', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'GR Corolla' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GR Supra' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'สปอร์ต', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'GR Supra' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GR Yaris' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'สปอร์ต/แฮทช์แบ็ก', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'GR Yaris' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'GR86' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'สปอร์ต', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'GR86' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Harrier' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2000-2020', 'SUV (นำเข้าอิสระ)', 2000, 2020, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Harrier' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Harrier' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2021-ปัจจุบัน', 'SUV', 2021, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Harrier' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Champ' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'กระบะ', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Champ' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Mighty X' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1998', 'กระบะ', 1996, 1998, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Mighty X' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Revo' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'กระบะ', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Revo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Sport Rider' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2004', 'PPV', 1998, 2004, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Sport Rider' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Tiger' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2004', 'กระบะ', 1998, 2004, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Tiger' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Hilux Vigo' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2015', 'กระบะ', 2004, 2015, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Hilux Vigo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Innova (AN40)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-2015', 'MPV', 2005, 2015, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Innova (AN40)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Innova Crysta (AN140)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-2022', 'MPV', 2016, 2022, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Innova Crysta (AN140)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Innova Zenix (AG10)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2023-ปัจจุบัน', 'MPV', 2023, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Innova Zenix (AG10)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Isis' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2017', 'MPV (นำเข้าอิสระ)', 2004, 2017, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Isis' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Land Cruiser' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Land Cruiser' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Land Cruiser FJ' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2026-ปัจจุบัน', 'SUV', 2026, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Land Cruiser FJ' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Land Cruiser Prado' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'SUV', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Land Cruiser Prado' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Majesty' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2019-ปัจจุบัน', 'แวนหรู', 2019, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Majesty' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Mark X' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2004-2019', 'เก๋ง (นำเข้าอิสระ)', 2004, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Mark X' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Noah / Voxy' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2001-ปัจจุบัน', 'MPV (นำเข้าอิสระ)', 2001, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Noah / Voxy' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Paseo' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ต้นยุค 2000', 'คูเป้', 1996, null, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Paseo' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Previa' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ต้นยุค 2000', 'MPV', 1996, null, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Previa' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Prius' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-2015', 'ไฮบริด', 2010, 2015, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Prius' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Prius C / Aqua' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2012-2019', 'ไฮบริด', 2012, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Prius C / Aqua' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'RAV4' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-1999', 'SUV', 1996, 1999, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'RAV4' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'RAV4' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-2019', 'SUV', 2013, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'RAV4' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Sienta' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'MPV', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Sienta' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Soluna' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-2003', 'เก๋ง', 1996, 2003, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Soluna' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Soluna Vios' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2002-2003', 'เก๋ง', 2002, 2003, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Soluna Vios' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Vellfire' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2015-ปัจจุบัน', 'แวน/MPV หรู', 2015, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Vellfire' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Veloz' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'MPV', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Veloz' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Ventury' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2005-2019', 'แวน', 2005, 2019, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Ventury' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Vios' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2022', 'เก๋ง', 2003, 2022, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Vios' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Wish' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-2009', 'MPV', 2003, 2009, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Wish' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Yaris (Vitz-based)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2006-2013', 'แฮทช์แบ็ก', 2006, 2013, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Yaris (Vitz-based)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Yaris (XP150)' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2013-ปัจจุบัน', 'แฮทช์แบ็ก', 2013, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Yaris (XP150)' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Yaris Ativ' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2017-ปัจจุบัน', 'เก๋ง', 2017, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Yaris Ativ' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Yaris Cross' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2020-ปัจจุบัน', 'ครอสโอเวอร์', 2020, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'Yaris Cross' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'bZ4X' from brands where brand_name = 'Toyota' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2022-ปัจจุบัน', 'EV', 2022, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Toyota' and m.model_name = 'bZ4X' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Volkswagen') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'Beetle' from brands where brand_name = 'Volkswagen' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-2010', 'แฮทช์แบ็ก', 1998, 2010, false, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volkswagen' and m.model_name = 'Beetle' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Golf' from brands where brand_name = 'Volkswagen' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'แฮทช์แบ็ก', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volkswagen' and m.model_name = 'Golf' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Passat' from brands where brand_name = 'Volkswagen' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1996-ปัจจุบัน', 'เก๋ง', 1996, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volkswagen' and m.model_name = 'Passat' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'Tiguan' from brands where brand_name = 'Volkswagen' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2008-ปัจจุบัน', 'SUV', 2008, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volkswagen' and m.model_name = 'Tiguan' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('Volvo') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'S60' from brands where brand_name = 'Volvo' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '1998-ปัจจุบัน', 'เก๋ง', 1998, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volvo' and m.model_name = 'S60' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'S90' from brands where brand_name = 'Volvo' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2016-ปัจจุบัน', 'เก๋ง', 2016, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volvo' and m.model_name = 'S90' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'XC60' from brands where brand_name = 'Volvo' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2010-ปัจจุบัน', 'SUV', 2010, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volvo' and m.model_name = 'XC60' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'XC90' from brands where brand_name = 'Volvo' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2003-ปัจจุบัน', 'SUV', 2003, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'Volvo' and m.model_name = 'XC90' on conflict (model_id, generation_code) do nothing;

insert into brands (brand_name) values ('XPeng') on conflict (brand_name) do nothing;
insert into models (brand_id, model_name) select brand_id, 'G6' from brands where brand_name = 'XPeng' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'SUV ไฟฟ้า', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'XPeng' and m.model_name = 'G6' on conflict (model_id, generation_code) do nothing;

insert into models (brand_id, model_name) select brand_id, 'X9' from brands where brand_name = 'XPeng' on conflict (brand_id, model_name) do nothing;
insert into model_generations (model_id, generation_code, vehicle_type, year_start, year_end, is_current, note) select m.model_id, '2024-ปัจจุบัน', 'MPV ไฟฟ้าหรู', 2024, null, true, null from models m join brands b on b.brand_id = m.brand_id where b.brand_name = 'XPeng' and m.model_name = 'X9' on conflict (model_id, generation_code) do nothing;
