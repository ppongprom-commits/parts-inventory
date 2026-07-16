# ระบบสต็อกอะไหล่รถ (MVP)

หน้าที่มี 8 หน้า + 1 API route:
- `/` — ดูรายการ + ค้นหา/filter (ยี่ห้อ, ชื่ออะไหล่, โซนแบบ dropdown) — สลับมุมมอง List/Gallery ได้ — คลิกการ์ดเพื่อแก้ไข
- `/add` — เพิ่มอะไหล่ใหม่ (ถ่ายรูปได้หลายรูป + กรอกข้อมูล) — ปีดึงจากฐานข้อมูลอัตโนมัติ พิมพ์เองไม่ได้
- `/edit/[id]` — แก้ไขข้อมูล / เพิ่ม-ลบรูป (คลิกขยายได้) / ซ่อนอะไหล่ (soft delete)
- `/admin` — หน้ารวมตั้งค่าระบบ
- `/admin/car-data` — จัดการยี่ห้อ/รุ่น/ช่วงปีผลิต + ดูประวัติการแก้ไข (audit log)
- `/admin/zones` — จัดการรายการโซนจัดเก็บ (เพิ่ม/ลบ)
- `/admin/options` — จัดการ สภาพ/ที่มา/สถานะ (เพิ่ม/ลบ)
- `/admin/trash` — กู้คืน หรือลบอะไหล่ที่ถูกซ่อนไว้ถาวร
- `/api/car-generations` — server route รับ insert/update ข้อมูล generation พร้อมแนบ IP/User-Agent เข้า audit log

---

## ก่อนเริ่ม — เตรียม Supabase ให้ครบ 2 อย่าง

### 1. Table `parts` (ถ้ายังไม่ได้สร้าง รันใน SQL Editor)
```sql
create table parts (
  id uuid default gen_random_uuid() primary key,
  photo_url text,
  part_name text not null,
  car_brand text,
  car_model text,
  condition text,
  zone_code text,
  source_type text,
  price numeric,
  status text default 'available',
  created_at timestamp default now()
);

-- เปิด public read/insert สำหรับ MVP (ยังไม่มี login)
alter table parts enable row level security;

create policy "Allow public read" on parts
  for select using (true);

create policy "Allow public insert" on parts
  for insert with check (true);

-- เพิ่มสำหรับฟีเจอร์แก้ไข/ลบ
create policy "Allow public update" on parts
  for update using (true) with check (true);

create policy "Allow public delete" on parts
  for delete using (true);
```

### 3. เพิ่มคอลัมน์ `car_year` (สำหรับฟีเจอร์ autocomplete ยี่ห้อ/รุ่น/ปี)
ถ้า table `parts` สร้างไว้ก่อนหน้านี้แล้ว ต้องรัน SQL นี้เพิ่ม (ถ้าเพิ่งสร้าง table ใหม่ ข้ามได้เพราะ query ด้านบนควรเพิ่ม column นี้เข้าไปด้วยแล้ว):
```sql
alter table parts add column if not exists car_year integer;
```

### 4. Table `zones` (สำหรับหน้า admin จัดการโซนจัดเก็บ)
```sql
create table zones (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  name text,
  created_at timestamp default now()
);

alter table zones enable row level security;

create policy "Allow public read zones" on zones
  for select using (true);

create policy "Allow public insert zones" on zones
  for insert with check (true);

create policy "Allow public delete zones" on zones
  for delete using (true);
```

### 5. Table `options` (สำหรับหน้า admin จัดการ สภาพ/ที่มา/สถานะ)
```sql
create table options (
  id uuid default gen_random_uuid() primary key,
  category text not null, -- 'condition' | 'source_type' | 'status'
  value text not null,
  sort_order integer default 0,
  created_at timestamp default now(),
  unique(category, value)
);

alter table options enable row level security;

create policy "Allow public read options" on options
  for select using (true);

create policy "Allow public insert options" on options
  for insert with check (true);

create policy "Allow public delete options" on options
  for delete using (true);

-- ใส่ค่าเริ่มต้นให้เหมือนของเดิม (รวม "มือสองตามสภาพ" ที่เพิ่มใหม่)
insert into options (category, value, sort_order) values
('condition', 'ใหม่', 1),
('condition', 'มือสอง-ดี', 2),
('condition', 'มือสอง-ซ่อม', 3),
('condition', 'มือสองตามสภาพ', 4),
('source_type', 'รถชน', 1),
('source_type', 'ประกัน total loss', 2),
('source_type', 'น้ำท่วม', 3),
('status', 'available', 1),
('status', 'reserved', 2),
('status', 'sold', 3);
```

### 6. เพิ่มคอลัมน์รองรับหลายรูป + soft delete
```sql
alter table parts add column if not exists photo_urls text[];
alter table parts add column if not exists is_active boolean default true;
```
คอลัมน์ `photo_urls` เก็บ array ของ URL รูปทั้งหมด (`photo_url` เดิมยังอยู่ เก็บรูปแรกไว้ใช้เป็น thumbnail) ส่วน `is_active` ใช้แทนการลบจริง — ตั้ง default เป็น `true` ทำให้ข้อมูลเก่าที่มีอยู่แล้วยังแสดงผลตามปกติโดยไม่ต้อง backfill เพิ่ม

### 7. ระบบ Login + Multi-Tenant (แยกข้อมูลตามอู่) + สิทธิ์ผู้ใช้ 5 ระดับ

**7.1 เปิด Email Auth ใน Supabase**
Dashboard → Authentication → Providers → เช็คว่า "Email" เปิดอยู่ (ปกติเปิดเป็น default)
แนะนำ: Authentication → Settings → ปิด "Confirm email" ไว้ก่อนช่วงทดสอบ (ไม่งั้นต้องเช็คอีเมลทุกครั้งที่ signup ทดสอบ) แล้วค่อยเปิดกลับตอน production จริง

**7.2 รันไฟล์ `db/auth_multi_tenant_schema.sql`** ทั้งไฟล์ใน SQL Editor
สร้าง `shops`, `shop_members`, `shop_invites`, `user_sessions` + RPC functions + RLS policy ที่บังคับแยกข้อมูลตามอู่ทุกตาราง (`parts`/`zones`/`options`)

⚠️ **หลังรันไฟล์นี้ ข้อมูล parts/zones/options เดิมทั้งหมดจะ "หายไป" ทันที** (ไม่ได้ลบจริง แค่ RLS จะซ่อนไว้เพราะยังไม่มี `shop_id`) ต้องทำขั้นต่อไปก่อนถึงจะเห็นข้อมูลเดิมอีกครั้ง

**7.3 สร้างบัญชีแรก (จะกลายเป็นเจ้าของอู่)**
เข้า `/signup` → กรอกชื่ออู่ + อีเมล + รหัสผ่าน → ระบบสร้าง shop ใหม่ให้อัตโนมัติ (เป็น `trialing` 14 วัน) และตั้งเป็น owner ทันที

**7.4 Migrate ข้อมูลเดิมเข้าอู่แรก (ทำครั้งเดียว)**
หา `shop_id` ของอู่ที่เพิ่งสร้าง (ดูใน Table Editor → `shops`) แล้วรัน SQL นี้ (แทนเลข `1` ด้วย shop_id จริง):
```sql
update parts   set shop_id = 1 where shop_id is null;
update zones   set shop_id = 1 where shop_id is null;
update options set shop_id = 1 where shop_id is null;
```
รีเฟรชหน้าเว็บ — ข้อมูลเดิมจะกลับมาแสดงในอู่ที่เพิ่งสร้างครบทุกอย่าง

**7.5 เชิญสมาชิกเพิ่ม**
เข้า `/admin/team` (owner/manager เท่านั้น) → กรอกอีเมล + เลือกบทบาท → กด "เชิญเข้าอู่" — คนที่ถูกเชิญต้องไป `/signup` ด้วยอีเมลเดียวกัน (ระบบจะรับคำเชิญอัตโนมัติหลัง signup/login)

**⚠️ ข้อจำกัดที่ทำไว้ในรอบนี้ (simplification):**
- Soft-delete (ปุ่ม "ลบ" ในหน้าแก้ไข) อนุญาตถึงระดับ **ช่าง** ด้วย (ตาม RLS update policy) แม้ตาม permission matrix ที่ออกแบบไว้จะระบุว่าควรเป็นแค่หัวหน้างานขึ้นไป — ถ้าต้องการแยกสิทธิ์ระดับ field-level แบบเป๊ะ ต้องแยก RLS policy หรือทำผ่าน RPC function เพิ่ม
- Concurrent session limit ทำงานแบบ **client-side enforcement** (เช็ค/บันทึกจากฝั่ง browser ตอน login) ไม่ใช่ server-side middleware ที่ block เด็ดขาด — เพียงพอสำหรับ MVP แต่ยังเลี่ยงได้ถ้าตั้งใจแฮ็ก
- ยังไม่มี middleware.js ป้องกัน route ฝั่ง server (ตอนนี้ป้องกันด้วย client-side redirect ใน `RequireAuth` เท่านั้น) — ถ้าต้องการความปลอดภัยสูงขึ้นควรเพิ่ม server-side session check ภายหลัง

### 7.6 สร้างบัญชีทันที (ไม่ต้องผ่านอีเมลยืนยัน)

นอกจาก "เชิญด้วยอีเมล" (ต้องให้พนักงานไป signup+ยืนยันอีเมลเอง) เพิ่มทางเลือกให้ owner/manager **สร้างบัญชีให้พนักงานได้ทันที** ผ่านหน้า `/admin/team` — เหมาะกับช่าง/พนักงานที่ไม่มีอีเมลจริงหรือไม่สะดวกทำขั้นตอนสมัคร

**วิธีทำงาน:** ใช้ API route `/api/team/create-member` (service role, เหมือน platform-admin) เรียก Supabase Admin API `auth.admin.createUser({ email_confirm: true })` สร้าง user พร้อม active ทันที ไม่ต้องผ่านขั้นตอนคำเชิญ/ยืนยันอีเมลเลย — owner/manager ตั้งอีเมล (ใช้อะไรก็ได้ที่ไม่ซ้ำ ไม่จำเป็นต้องเปิดได้จริง) + รหัสผ่าน (มีปุ่มสุ่มให้) แล้วส่งข้อมูลให้พนักงานเองทาง LINE/บอกปากเปล่า

**ความปลอดภัย:** API route เช็คสิทธิ์ owner/manager ของอู่นั้นก่อนทุกครั้ง (เทียบจาก token คนเรียก) ป้องกันไม่ให้ใครก็ได้มาสร้างสมาชิกในอู่คนอื่น

### 7.6 Platform Admin — หน้าดูรายชื่อทุกอู่ (คนละเรื่องกับ `/admin/team`)

`/admin/team` เป็นของ **เจ้าของอู่แต่ละอู่** เห็นแค่ทีมตัวเอง (ผ่าน RLS ปกติ) ส่วน `/platform-admin` เป็นของ **เจ้าของแพลตฟอร์ม (คุณอั้ม)** เห็นทุกอู่พร้อมกัน ต้องใช้สถาปัตยกรรมคนละแบบ (service role key ข้าม RLS) จึงแยกเป็นคนละระบบ

**ขั้นตอนติดตั้ง:**

1. รันไฟล์ `db/platform_admin_schema.sql` สร้าง table `platform_admins`
2. หา **Service Role Key** ที่ Supabase Dashboard → Project Settings → API Keys → Secret keys (`sb_secret_...`) — ใส่ในไฟล์ `.env.local` เป็น `SUPABASE_SERVICE_ROLE_KEY` (⚠️ ต้องใส่ใน Vercel Environment Variables ตอน deploy ด้วย และ **ต้องไม่มี** `NEXT_PUBLIC_` prefix เด็ดขาด ไม่งั้นหลุดไปฝั่ง browser)
3. Signup สร้างบัญชีตัวเองก่อน (ถ้ายังไม่มี) แล้วรัน SQL นี้ (แทนอีเมลด้วยของจริง):
```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'your-email@example.com';
```
4. เข้า `/platform-admin` — เห็นสรุปสถิติรวม (จำนวนอู่ตามสถานะ + MRR ประมาณการ), ค้นหา/filter อู่, คลิกอู่เพื่อ**แก้ไข subscription status/plan/วันหมดอายุ** ได้จริง และดูรายชื่อสมาชิกของแต่ละอู่ (พร้อมอีเมล+บทบาท)

### 8. Schema ข้อมูลรถแบบ Relational (brands → models → model_generations) + Audit Trail

**สำคัญ: รันตามลำดับนี้เท่านั้น**

**7.1** รันไฟล์ `db/car_models_schema.sql` ทั้งไฟล์ใน SQL Editor ก่อน — สร้าง table `brands`/`models`/`model_generations`/`audit_log`, view `model_generations_display`, RPC functions (`get_or_create_brand`, `get_or_create_model`, `insert_model_generation`, `update_model_generation`) พร้อม RLS + grant execute ให้ครบ และเพิ่มคอลัมน์ `generation_id` + `car_year_display` ให้ตาราง `parts` ไปในตัว

**7.2** รันไฟล์ `db/car_models_migration_data.sql` ต่อ — import ข้อมูลรถ 311 รุ่นเดิม (จาก `lib/carModels.json`) เข้า schema ใหม่ทั้งหมด โดย**ไม่เสียข้อมูลเดิมแม้แต่แถวเดียว**

> **หมายเหตุการ migrate:** รอบแรกนี้ import แบบ 1 แถวเดิม = 1 model + 1 generation (ตั้ง `generation_code` เป็นช่วงปีไปก่อน เช่น `"2005-2015"`) เพื่อไม่ให้เสียข้อมูล จากนั้นค่อยๆ ไปแยก/ปรับ generation code ให้ละเอียดขึ้น (เช่นแยก AE100/AE111 ออกจาก Corolla Altis) ทีหลังผ่านหน้า `/admin/car-data` ได้ทุกเมื่อ — ไม่ต้องแก้ครั้งเดียวให้สมบูรณ์ตั้งแต่แรก

**ทำไมต้องออกแบบแบบนี้:**
- ช่อง "ปี" ในหน้าเพิ่ม/แก้ไขอะไหล่ **ไม่ให้ user พิมพ์เองอีกต่อไป** — ต้องเลือกรถจากช่องค้นหาเท่านั้น ระบบจะ prefill ปีเป็น format `year_start - year_end_or_status` ให้อัตโนมัติจาก view `model_generations_display`
- การแก้ไข/เพิ่มข้อมูล generation (ปีของแต่ละรุ่น) ทุกครั้งจะถูกบันทึกลง `audit_log` เสมอ — เก็บว่า **แก้เมื่อไหร่ + IP + browser (User-Agent)** ของคนแก้ (ยังไม่มีระบบ login จึงใช้ IP/browser แทนตัวตนไปก่อน) ดูประวัติได้ที่หน้า `/admin/car-data` ปุ่ม "📜 ประวัติ" ในแต่ละ generation
- การเขียนข้อมูลทั้งหมดถูกบังคับให้ผ่าน RPC function (`security definer`) เท่านั้น — ตาราง `model_generations` เปิด RLS แบบอ่านได้อย่างเดียวสำหรับ public ไม่มี policy insert/update ตรงๆ จึงเขียนข้าม audit log ไม่ได้เลย

**ทำไมต้องมี API route (`app/api/car-generations/route.js`):**
Postgres function รู้ไม่ได้ว่า IP/browser ของคนเรียกคืออะไร — ข้อมูลนี้อยู่ใน HTTP request ที่ยิงมาที่ Next.js เท่านั้น จึงต้องมี server route อ่าน header `x-forwarded-for` และ `user-agent` จาก request แล้วส่งต่อเข้า RPC ให้ — เรียกตรงจาก browser ไปที่ Supabase RPC เฉยๆ จะไม่มี IP/UA ที่ถูกต้องให้บันทึก

### 2. Storage bucket `part-photos`
Dashboard → Storage → New bucket → ชื่อ `part-photos` → ตั้งเป็น **Public**

จากนั้นต้องเพิ่ม policy ให้ upload ได้ (Storage → Policies):
```sql
create policy "Allow public upload"
on storage.objects for insert
with check (bucket_id = 'part-photos');

create policy "Allow public read photos"
on storage.objects for select
using (bucket_id = 'part-photos');
```

---

### 9. งานเข้าอู่ (Jobs) — รับ/ติดตามงานซ่อม แยกจากข้อมูลสต็อก

รัน `db/jobs_schema.sql` ใน SQL Editor — สร้างตาราง `jobs` (เก็บข้อมูลลูกค้า+รถ+สถานะ+ผู้รับผิดชอบ) พร้อม RLS แบบ shop-scoped เหมือนตารางอื่น และเพิ่มคอลัมน์ `job_id` ให้ `parts` (nullable) เผื่ออยากโยงว่าอะไหล่ชิ้นไหนถอดมาจากงานไหน

**หน้าที่เพิ่ม:**
- `/jobs` — รายการงาน + filter สถานะ + ค้นหา
- `/jobs/new` — รับงานใหม่ (ถ่ายรูปสภาพรถ, ข้อมูลลูกค้า, ค้นหารถจากฐานข้อมูล)
- `/jobs/[id]` — แก้ไข/เปลี่ยนสถานะ/มอบหมายช่าง/ลบงาน

**สถานะงาน:** รับเรื่องแล้ว → กำลังซ่อม → รออะไหล่ → ซ่อมเสร็จแล้ว → ส่งมอบแล้ว (หรือยกเลิก)

**หลักการสำคัญ:** ข้อมูลลูกค้า (ชื่อ/เบอร์โทร) อยู่ใน `jobs` เท่านั้น **ไม่ปนกับตาราง `parts`** ตามหลักการที่ตกลงกันไว้ตั้งแต่มีตติ้งแรก — ถ้าอยากรู้ว่าอะไหล่ชิ้นไหนมาจากงานไหน ใช้ `job_id` เชื่อมแทน ไม่ต้อง copy ข้อมูลลูกค้าไปซ้ำ

### 10. Customer Portal — ลิงก์ให้ลูกค้าดูรายการซ่อม+ค่าใช้จ่าย+พิมพ์ PDF

รัน `db/customer_portal_schema.sql` เพิ่ม (ต้องรันหลัง `jobs_schema.sql` เพราะอ้างอิงตาราง `jobs`)

**สร้างเพิ่ม:**
- table `customers` — ผูกด้วยเบอร์โทร (1 ลูกค้าเห็นได้ทุกคัน/ทุกงานผ่านลิงก์เดียว)
- table `job_cost_items` — รายการค่าใช้จ่าย (ค่าแรง/ค่าอะไหล่/อื่นๆ) ต่องาน
- `jobs.closed_at` — บันทึกอัตโนมัติเมื่อสถานะเปลี่ยนเป็นซ่อมเสร็จ/ส่งมอบ/ยกเลิก

**กฎการมองเห็นของลูกค้า:** เห็นงานที่ยังไม่ปิด + งานที่ปิดมาไม่เกิน **731 วัน** นับจากวันที่ปิดงาน (`closed_at`) — เกินกว่านั้นจะมองไม่เห็นอัตโนมัติ ไม่ต้องลบข้อมูลจริง

**หน้าที่เพิ่ม:**
- `/share/customer/[token]` — รายการงานซ่อมทั้งหมดของลูกค้า (public ไม่ต้อง login)
- `/share/customer/[token]/job/[jobId]` — รายละเอียด+รายการค่าใช้จ่าย+ปุ่มพิมพ์เป็น PDF (ใช้ browser print)
- ในหน้า `/jobs/[id]` (แอดมิน) เพิ่มส่วนจัดการรายการค่าใช้จ่าย + ปุ่ม "คัดลอกลิงก์ให้ลูกค้า"

**ความปลอดภัย:** เข้าถึงผ่าน API route ที่ใช้ Service Role Key เท่านั้น (เหมือน Platform Admin) — ไม่เปิด RLS ให้ query ตรงๆ จาก public เด็ดขาด แต่ละ token ผูกกับลูกค้าคนเดียว เดา job_id ของคนอื่นดูไม่ได้

**พิมพ์เป็น PDF:** ใช้ browser print (`window.print()`) พร้อม print stylesheet ซ่อนปุ่ม/nav ให้เหลือแค่เนื้อหาใบสรุป — ลูกค้ากด "พิมพ์" ในเบราว์เซอร์แล้วเลือก "Save as PDF" ได้เลย ไม่ต้องติดตั้ง library เพิ่ม

### 11. Jobs Phase A-D Upgrade — ปรับให้ใกล้เคียงระบบซ่อมรถที่ใช้งานจริง

รัน `db/jobs_phase_upgrade_schema.sql` เพิ่ม (ต้องรันหลัง `jobs_schema.sql` และ `customer_portal_schema.sql`)

**Phase A — เร็วขึ้น + VAT:**
- จัดลำดับรายการค่าใช้จ่ายได้ (ปุ่ม ▲▼)
- เพิ่มรายการเร็วขึ้น: พิมพ์ขึ้นต้นด้วย "ค่า" จะเดาเป็นหมวดค่าแรงให้อัตโนมัติ (ยังกดปุ่มเลือกหมวดเองทับได้)
- VAT toggle (Non-VAT / VAT 7%) คำนวณให้อัตโนมัติ

**Phase B — เอกสาร 3 ประเภท (ใบรับรถ/ใบเสนอราคา/ใบแจ้งหนี้):**
- table `job_documents` เก็บ **snapshot แช่แข็งข้อมูล ณ ตอนสร้างเอกสาร** — แก้ราคาทีหลังไม่กระทบเอกสารเก่าที่พิมพ์ไปแล้ว
- เลขที่เอกสารอัตโนมัติ format `YYMM-<timestamp>`
- หน้า `/jobs/[id]/documents/[documentId]` แสดง+พิมพ์เอกสารตาม `doc_type` — ใบแจ้งหนี้แยกคอลัมน์ค่าแรง/ค่าอะไหล่ ใบเสนอราคาคำนวณ VAT ให้

**Phase C — หน้ารายการงานใหม่:**
- Icon tabs (ทั้งหมด/เปิดอยู่/ปิดแล้ว) แทน dropdown พร้อมตัวนับแต่ละแท็บ
- Layout กระชับ: ยี่ห้อ+รุ่น+ทะเบียนซ้าย, ลูกค้า+หมายเหตุขวา, ไอคอนสถานะ 🔧/✅ ดูง่ายแวบเดียว

**Phase D — แผนภาพจุดเสียหาย:**
- Component `CarDamageDiagram` — โครงรถ SVG 3 มุม (หน้า/ข้าง/หลัง) แตะเพื่อมาร์กจุด+ใส่หมายเหตุ
- เก็บเป็น `jobs.damage_points` (jsonb array พิกัดสัดส่วน 0-1 responsive ไม่ผูก pixel)
- แสดงในใบรับรถอัตโนมัติ (โชว์ทั้ง 3 มุมพร้อมกันตอนพิมพ์)

### 13. Phase E — กลุ่มผู้ใช้ (Visibility) + ขั้นตอนงาน (Workflow Steps) + เตรียมต่อ Grafana

รัน `db/visibility_groups_and_workflow_schema.sql` เพิ่ม (ต้องรันหลัง `jobs_schema.sql` เพราะแก้ RLS policy ของ `jobs`) แล้วรัน **`db/job_multi_group_migration.sql`** ต่อทันที (เปลี่ยนจาก 1 กลุ่มต่องาน เป็นหลายกลุ่มต่องาน — ต้องรันคู่กันเสมอ ไม่รันแยกทีละไฟล์)

**กลุ่มผู้ใช้ (Visibility Groups):**
- หน้า `/admin/groups` — สร้างกลุ่มตามสาขา/ความชำนาญ (เช่น "ช่างเครื่อง", "ช่างสี", "ช่างไฟฟ้า" — เพิ่มได้ไม่จำกัด) เพิ่ม/ลบสมาชิกในกลุ่ม
- ตอนรับงานใหม่ เลือกได้ว่าให้ "ทุกคนเห็น" (ค่าเริ่มต้น ไม่เลือกกลุ่มเลย) หรือเลือก **กลุ่มได้มากกว่า 1 กลุ่มต่องาน** (เช่น งานที่ต้องทั้งช่างเครื่องและช่างสีร่วมกันดู)
- ผูกความสัมพันธ์แบบ many-to-many ผ่านตาราง `job_visibility_groups` — 1 งานอยู่ได้หลายกลุ่ม, 1 กลุ่มดูได้หลายงาน
- **เจ้าของ/ผู้จัดการเห็นทุกงานเสมอ** ไม่ว่าจะอยู่กลุ่มไหน (ผ่านฟังก์ชัน `can_view_job` ที่แก้ RLS policy ของ `jobs`)

**ขั้นตอนงาน (Workflow Steps):**
- ตอนรับงานใหม่ระบุขั้นตอนคร่าวๆ ได้เลย (ชื่อขั้นตอน + ผู้รับผิดชอบ) เพิ่ม/ลบแถวได้ไม่จำกัด
- ในหน้า `/jobs/[id]` จัดการขั้นตอนต่อได้เต็มรูปแบบ: เพิ่ม/ลบ/จัดลำดับ (▲▼)/มอบหมายใหม่/เปลี่ยนสถานะ (ยังไม่เริ่ม → กำลังทำ → เสร็จแล้ว/ข้าม)
- `started_at`/`completed_at` บันทึกอัตโนมัติเมื่อเปลี่ยนสถานะ (ผ่าน trigger `update_job_workflow_step_timestamps`)

**เตรียมต่อ Grafana:**
- สร้าง 3 SQL views ที่ query ง่ายสำหรับทำ dashboard:
  - `grafana_job_step_durations` — ระยะเวลาที่ใช้ต่อขั้นตอน (นาที)
  - `grafana_workload_by_assignee` — งานค้าง/เสร็จแล้วต่อคน
  - `grafana_job_lifecycle` — ระยะเวลารวมต่องานตั้งแต่รับเข้าจนปิดงาน
- Grafana ต่อ Postgres ของ Supabase ได้โดยตรง (Project Settings → Database → connection string) — **แนะนำสร้าง Postgres role แบบ read-only แยกให้ Grafana** (คำสั่ง SQL อยู่ท้ายไฟล์ schema) ไม่ควรใช้ service role key หรือ user หลัก

### 14. ใบแจ้งหนี้ตามข้อกำหนดกรมสรรพากร (มาตรา 86/4)

รัน `db/tax_invoice_compliance_migration.sql` เพิ่ม — เพิ่มคอลัมน์ที่กฎหมายกำหนดให้ใบกำกับภาษีเต็มรูปต้องมี:

- `shops.address`, `shops.tax_id` (เลขผู้เสียภาษี 13 หลัก), `shops.phone` — ตั้งค่าได้ที่ `/admin` (การ์ด "🏢 ข้อมูลร้าน/อู่")
- `customers.address`, `jobs.customer_address` — ที่อยู่ผู้ซื้อ/ผู้รับบริการ (กรอกตอนรับงานใหม่ หรือแก้ทีหลังได้)

**หน้าใบกำกับภาษี/ใบแจ้งหนี้ (`doc_type: 'billing'`)** ตอนนี้มีครบตามมาตรา 86/4:
1. คำว่า "ใบกำกับภาษี / ใบแจ้งหนี้" เด่นชัด
2. ชื่อ ที่อยู่ เลขผู้เสียภาษีของร้าน
3. ชื่อ ที่อยู่ ผู้ซื้อ/ผู้รับบริการ
4. เลขที่เอกสาร (running number จาก `generate_doc_number`)
5. รายการสินค้า/บริการ + มูลค่า
6. VAT แยกออกจากมูลค่าสินค้าให้ชัดเจน
7. วันที่ออกเอกสาร
8. ขึ้นคำเตือนสีแดงถ้ายังไม่ได้ตั้งเลขผู้เสียภาษี — เตือนก่อนออกเอกสารจริง

**ใบรับรถ/ใบเสนอราคา** ปรับ layout ให้เหมือนกัน (หัวเอกสาร, กล่องข้อมูลลูกค้า+รถ, ช่องเซ็นชื่อท้ายเอกสาร) ตามที่ขอให้ "คล้ายใบแจ้งหนี้" — ต่างกันแค่ไม่บังคับต้องมีเลขผู้เสียภาษี/ที่อยู่ เพราะไม่ใช่เอกสารภาษีตามกฎหมาย

**⚠️ ข้อจำกัด:** ยังไม่ได้ทำ "ปริมาณ" (quantity) แยกเป็นคอลัมน์ตัวเลขในตารางรายการ (กฎหมายกำหนดไว้ แต่ระบบปัจจุบันเก็บแค่คำอธิบาย+มูลค่ารวมต่อรายการ ไม่มี quantity/unit price แยก) — ถ้าต้องการให้ครบ 100% ต้องแก้ schema ตาราง `job_cost_items` เพิ่ม บอกได้เลยถ้าต้องการให้ทำต่อ

### 12. Theme สว่าง/มืด + ปรับความกว้างช่องค้นหารถ

**Theme:** เพิ่ม `lib/ThemeProvider.js` จัดการ light/dark ผ่าน CSS variable บน `<html data-theme="...">` — default เป็น **สีสว่าง** เสมอ ปรับได้ที่ `/admin` (การ์ด "🎨 ธีมสี") ค่าที่เลือกจำไว้ใน localStorage ของเครื่องนั้นๆ (คนละเครื่องเลือกไม่เหมือนกันได้)

**สถานะ:** แก้ครบ 100% แล้ว — ไล่แทนที่สี hardcode ทั้งหมด (307 จุด ใน 19 ไฟล์) ด้วย CSS variable เรียบร้อย ทุกหน้ารวม modal/lightbox/ปุ่มต่างๆ ปรับตาม theme ถูกต้องครบ

**ช่องค้นหารถ:** ปรับความกว้างเหลือ 50% ของพื้นที่ (มี min-width 220px กันแคบเกินบนจอเล็ก) แก้ที่ `components/CarAutocomplete.js` จุดเดียว มีผลกับทุกหน้าที่เรียกใช้ (`/add`, `/edit/[id]`, `/jobs/new`) อัตโนมัติ



```bash
# 1. ติดตั้ง dependencies
npm install

# 2. คัดลอกไฟล์ env แล้วกรอกค่าจริง
cp .env.local.example .env.local
# แก้ .env.local ใส่ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# 3. รันแบบ dev (ทดสอบในเครื่อง)
npm run dev
# เปิด http://localhost:3000
```

## Deploy ขึ้น Vercel
1. Push โค้ดขึ้น GitHub repo
2. เข้า vercel.com → New Project → เลือก repo นี้
3. ใส่ Environment Variables 2 ตัว (เหมือนใน .env.local) ในหน้า Vercel project settings
4. Deploy

---

## โครงสร้างไฟล์
```
parts-inventory/
├── app/
│   ├── layout.js       ← layout หลัก (ครอบด้วย AuthProvider)
│   ├── globals.css     ← สไตล์
│   ├── page.js         ← หน้าแรก (list + search, ต้อง login)
│   ├── login/
│   │   └── page.js     ← เข้าสู่ระบบ
│   ├── signup/
│   │   └── page.js     ← สมัคร + สร้างอู่ใหม่ (กลายเป็น owner)
│   ├── add/
│   │   └── page.js     ← หน้าเพิ่มอะไหล่
│   ├── edit/
│   │   └── [id]/
│   │       └── page.js ← หน้าแก้ไข/ลบอะไหล่ (คลิกรูปขยายได้)
│   ├── api/
│   │   └── car-generations/
│   │       └── route.js ← server route แนบ IP/UA เข้า audit log
│   └── admin/
│       ├── page.js         ← หน้ารวมตั้งค่า
│       ├── team/
│       │   └── page.js     ← เชิญสมาชิก จัดการสิทธิ์ (owner/manager)
│       ├── car-data/
│       │   └── page.js     ← จัดการยี่ห้อ/รุ่น/generation + ดูประวัติ (ข้อมูลกลาง ไม่แยกตามอู่)
│       ├── zones/
│       │   └── page.js     ← จัดการโซนจัดเก็บ
│       ├── options/
│       │   └── page.js     ← จัดการ สภาพ/ที่มา/สถานะ
│       └── trash/
│           └── page.js     ← กู้คืน/ลบอะไหล่ถาวร
├── components/
│   ├── CarAutocomplete.js  ← ค้นหายี่ห้อ/รุ่น/ปี (query จาก Supabase สด)
│   ├── RequireAuth.js      ← ป้องกันหน้าที่ต้อง login + เช็ค role
│   ├── IdleSessionGuard.js ← ครอบไว้ใน RequireAuth จัดการ auto logout
│   └── IdleLogoutModal.js  ← UI นับถอยหลังก่อน logout
├── config/
│   └── subscriptionTiers.js ← ราคา/limit แต่ละ tier (แก้ที่นี่ที่เดียว)
├── db/
│   ├── auth_multi_tenant_schema.sql   ← รันคู่กับการเปิด Auth (shops/members/sessions)
│   ├── car_models_schema.sql          ← รันครั้งแรกก่อนเสมอ (สร้าง schema/RPC/RLS ข้อมูลรถ)
│   └── car_models_migration_data.sql  ← รันต่อ (import ข้อมูลรถ 311 รุ่นเดิม)
├── lib/
│   ├── supabaseClient.js
│   ├── AuthProvider.js     ← React context: session, shop ปัจจุบัน, role
│   ├── sessionTracking.js  ← บังคับ maxDevicesPerUser/maxConcurrentSessions
│   ├── useIdleTimeout.js   ← hook ตรวจจับ idle + นับถอยหลัง
│   ├── carModels.json      ← ⚠️ เก็บไว้อ้างอิง/ใช้สร้าง migration เท่านั้น แอปไม่ import ใช้แล้ว
│   ├── zoneStorage.js      ← จำโซนล่าสุดที่เลือก (localStorage)
│   ├── viewModeStorage.js  ← จำโหมดแสดงผล list/gallery (localStorage)
│   ├── imageResize.js      ← ย่อ/บีบอัดรูปก่อนอัปโหลด
│   └── storageHelpers.js   ← อัปโหลด/ลบรูปใน Supabase Storage
├── package.json
├── next.config.mjs
└── .env.local.example
```

## ฟีเจอร์ Login + Multi-Tenant + สิทธิ์ผู้ใช้
- **Signup** สร้างอู่ใหม่ + เป็น owner ทันที เริ่ม trial 14 วันอัตโนมัติ
- **5 บทบาท**: เจ้าของ, ผู้จัดการ, หัวหน้างาน, ช่าง, ผู้ช่วยช่าง — สิทธิ์ต่างกันตาม RLS policy (ดูตาราง permission matrix ที่คุยกันไว้)
- **แยกข้อมูลตามอู่สนิท** ผ่าน Row Level Security — อู่ A มองไม่เห็นข้อมูลอู่ B เด็ดขาด (ยกเว้นข้อมูลรถ brands/models/generations ที่เป็นข้อมูลกลางใช้ร่วมกัน)
- **จำกัดอุปกรณ์/session พร้อมกัน** ตาม tier (`config/subscriptionTiers.js`) — login เครื่องที่ 3 จะเตะเครื่องเก่าสุดออกอัตโนมัติถ้าเกิน `maxDevicesPerUser`
- **Auto logout เมื่อไม่มีกิจกรรม 15 นาที** ขึ้นนับถอยหลัง 100 วินาทีก่อน logout จริง (ปรับตัวเลขได้ที่ `config/subscriptionTiers.js`)

## ฟีเจอร์ Autocomplete ยี่ห้อ/รุ่น/ปี (query จากฐานข้อมูลจริง)
พิมพ์ 2 ตัวอักษรขึ้นไปในช่อง "🔍 ค้นหารถ" — ค้นจาก view `model_generations_display` แบบ debounce (250ms) ทั้งยี่ห้อ/รุ่น/generation code พร้อมกัน เลือกแล้วเติมยี่ห้อ/รุ่น และ**ช่องปีจะ prefill อัตโนมัติเป็น read-only เสมอ** (format `year_start - year_end_or_status`) — **ไม่มีช่องให้พิมพ์ปีเองอีกต่อไป** ถ้าพิมพ์ยี่ห้อ/รุ่นเองโดยไม่เลือกจาก autocomplete (เช่นรถที่ยังไม่มีในฐานข้อมูล) ช่องปีจะว่าง/ไม่มีข้อมูลให้ — ต้องไปเพิ่มรุ่นนั้นที่หน้า `/admin/car-data` ก่อนถึงจะมีปีให้เลือกในครั้งถัดไป

## ฟีเจอร์ถ่ายรูปจากมือถือ
ปุ่ม "📷 ถ่ายรูปอะไหล่" เปิดกล้องมือถือโดยตรง (ไม่ต้องผ่านตัวเลือกไฟล์ระบบ) ถ่ายเสร็จรูปจะขึ้น preview ในหน้าทันทีอัตโนมัติ ในหน้าแก้ไข คลิกที่รูป preview เพื่อขยายดูแบบเต็มจอได้ (คลิกซ้ำเพื่อปิด)

## ฟีเจอร์จัดการโซนจัดเก็บ (Admin)
หน้า `/admin/zones` ใช้เพิ่ม/ลบรายชื่อโซนที่มีจริงในอู่ (เช่น JP-A1, EU-B3) พอมีโซนในระบบแล้ว หน้าเพิ่ม/แก้ไขอะไหล่จะเปลี่ยนจากช่องพิมพ์อิสระเป็น dropdown เลือกจากลิสต์นี้แทน — และจะ**จำโซนล่าสุดที่เลือกไว้เป็นค่า default** สำหรับเพิ่มอะไหล่ชิ้นถัดไป จนกว่าจะเปลี่ยนเอง (สะดวกเวลาต้องเพิ่มอะไหล่หลายชิ้นจากโซนเดียวกันติดกัน) หน้าแรกก็ filter ตามโซนแบบ dropdown เดียวกันนี้ด้วย

## ฟีเจอร์จัดการ สภาพ/ที่มา/สถานะ (Admin)
หน้า `/admin/options` ใช้เพิ่ม/ลบตัวเลือกในแต่ละหมวด (สภาพ, ที่มา, สถานะ) แทนที่จะ hardcode ไว้ในโค้ด — เพิ่มตัวเลือกใหม่ได้ทันทีโดยไม่ต้องแก้โค้ด

## ฟีเจอร์ Optimize Bandwidth / Storage
- **Resize รูปก่อนอัปโหลด**: ย่อเหลือด้านยาวสุด 2000px คุณภาพ JPEG ~87% (ทำงานฝั่ง browser ด้วย canvas, ดู `lib/imageResize.js`)
- **Pagination หน้าแรก**: โหลดครั้งละ 50 ชิ้น (`PAGE_SIZE` ใน `app/page.js`) เรียงจากล่าสุดไปเก่าสุดเสมอ พร้อมปุ่ม "โหลดเพิ่มเติม" — ค้นหา/filter ทำที่ฝั่ง database โดยตรง
- **Lazy loading รูปภาพ**: ใช้ `loading="lazy"` ให้ browser โหลดเฉพาะรูปที่เลื่อนมาเห็นจริง

## ฟีเจอร์รูปหลายใบต่ออะไหล่
เพิ่ม/แก้ไขอะไหล่ได้หลายรูปต่อ 1 ชิ้น (บังคับอย่างน้อย 1 รูปก่อนบันทึกเสมอ) กดปุ่มถ่าย/เลือกรูปซ้ำได้เรื่อยๆ เพื่อเพิ่มรูปทีละใบ มีปุ่ม × ลบรูปที่ไม่ต้องการออกจากรายการก่อนบันทึก คลิกรูป thumbnail เพื่อขยายดูได้ (lightbox) รูปแรกในลิสต์จะถูกใช้เป็น thumbnail หลักในหน้ารายการ

## ฟีเจอร์มุมมอง List / Gallery
หน้าแรกสลับมุมมองได้ที่ปุ่มขวาบนแถบ filter — **List (default)** แสดงรายละเอียดครบ, **Gallery** แสดงเป็น grid รูปภาพเน้นดูภาพรวม เลือกโหมดไว้แล้วจะจำไว้ (localStorage) ใช้ครั้งต่อไปโดยไม่ต้องเลือกซ้ำ

## ฟีเจอร์ Soft Delete (ถังขยะ)
กด "ลบ" ในหน้าแก้ไขจะไม่ลบข้อมูลจริง แต่จะซ่อนออกจากหน้าแรก (ตั้ง `is_active = false`) เท่านั้น ไปกู้คืนหรือลบถาวรจริงได้ที่ `/admin/trash` — ตอนลบถาวรระบบจะลบไฟล์รูปทั้งหมดออกจาก Storage ให้อัตโนมัติด้วย (best-effort)


## ทดสอบว่าใช้ได้จริง
1. เปิด `/add` → ถ่ายรูป (หรือเลือกไฟล์) + กรอกชื่ออะไหล่ → กด "บันทึกอะไหล่"
2. จะเด้งกลับหน้าแรกอัตโนมัติ เห็นรายการที่เพิ่งเพิ่ม
3. ลองพิมพ์ค้นหา/เลือก filter ยี่ห้อ/โซน ดูว่ากรองถูกต้อง

## ยังไม่ทำใน MVP นี้ (ตามที่ตกลงกันไว้)
- ❌ Login / role แยกสิทธิ์
- ❌ AI auto-post ไปโซเชียล
- ❌ ระบบขาย/ชำระเงิน
- ❌ ข้อมูลลูกค้า (เก็บแยกจากระบบนี้โดยเจตนา)

### 15. Phase 1-3 — แยกประเภทอะไหล่ + คุมสต็อก Consumable + ติดตามอะไหล่ถอด/กำไร

รัน `db/parts_classification_and_tracking_migration.sql`

**Phase 1 — แยก Salvage vs Consumable:**
- เพิ่ม `parts.item_type` (`salvage` = อะไหล่ถอดจากรถ / `consumable` = ของสิ้นเปลืองในงานซ่อม)
- หน้า `/add`, `/edit/[id]` มีปุ่มเลือกประเภทตั้งแต่แรก

**Phase 2 — คุมสต็อก Consumable:**
- เพิ่ม `parts.min_stock_level` + view `low_stock_parts` (เทียบ `quantity <= min_stock_level` ฝั่ง SQL เพราะ Supabase filter เทียบ 2 คอลัมน์กันเองตรงๆ ไม่ได้)
- หน้าแรกมี banner สีเหลืองแจ้งเตือนจำนวนของใกล้หมด กดแล้ว filter เฉพาะรายการนั้นได้

**Phase 3 — ติดตามอะไหล่ถอด + กำไรต่อคัน:**
- เพิ่ม `jobs.vehicle_purchase_price` (ราคาซื้อรถทั้งคัน)
- หน้า `/jobs/[id]` มีส่วน "ต้นทุน-กำไร" คำนวณจากอะไหล่ที่ผูก `job_id` กับงานนั้นแล้วขายแล้ว (`status='sold'`) เทียบกับราคาซื้อรถ
- หน้า `/add?job_id=X` (ลิงก์จากหน้างาน) ผูกอะไหล่ใหม่เข้ากับงานนั้นอัตโนมัติ
- หน้า `/edit/[id]` โชว์ "อยู่ในสต็อกมาแล้ว N วัน" + ลิงก์ย้อนกลับไปงานต้นทาง (ใช้หลัก FSN Analysis หาของค้างสต็อก)

**⚠️ ข้อจำกัด:** กำไรที่คำนวณเป็นตัวเลขประมาณการเทียบยอดขายสะสมกับราคาซื้อรถอย่างเดียว **ยังไม่รวมค่าแรงถอดแยก/ค่าใช้จ่ายอื่น** — เหมาะเป็นตัวเลขอ้างอิงคร่าวๆ ไม่ใช่ต้นทุนที่แม่นยำ 100%
