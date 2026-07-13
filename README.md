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

### 7. Schema ข้อมูลรถแบบ Relational (brands → models → model_generations) + Audit Trail

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

## วิธีรันโปรเจกต์

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
│   ├── layout.js       ← layout หลัก
│   ├── globals.css     ← สไตล์
│   ├── page.js         ← หน้าแรก (list + search)
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
│       ├── car-data/
│       │   └── page.js     ← จัดการยี่ห้อ/รุ่น/generation + ดูประวัติ
│       ├── zones/
│       │   └── page.js     ← จัดการโซนจัดเก็บ
│       ├── options/
│       │   └── page.js     ← จัดการ สภาพ/ที่มา/สถานะ
│       └── trash/
│           └── page.js     ← กู้คืน/ลบอะไหล่ถาวร
├── components/
│   └── CarAutocomplete.js  ← ค้นหายี่ห้อ/รุ่น/ปี (query จาก Supabase สด — ไม่ใช้ JSON แล้ว)
├── db/
│   ├── car_models_schema.sql        ← รันครั้งแรกก่อนเสมอ (สร้าง schema/RPC/RLS)
│   └── car_models_migration_data.sql ← รันต่อ (import ข้อมูลรถ 311 รุ่นเดิม)
├── lib/
│   ├── supabaseClient.js
│   ├── carModels.json      ← ⚠️ เก็บไว้อ้างอิง/ใช้สร้าง migration เท่านั้น แอปไม่ import ใช้แล้ว
│   ├── zoneStorage.js      ← จำโซนล่าสุดที่เลือก (localStorage)
│   ├── viewModeStorage.js  ← จำโหมดแสดงผล list/gallery (localStorage)
│   ├── imageResize.js      ← ย่อ/บีบอัดรูปก่อนอัปโหลด
│   └── storageHelpers.js   ← อัปโหลด/ลบรูปใน Supabase Storage
├── package.json
├── next.config.mjs
└── .env.local.example
```

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
