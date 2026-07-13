# ระบบสต็อกอะไหล่รถ (MVP)

หน้าที่มี 2 หน้า:
- `/` — ดูรายการ + ค้นหา/filter (ยี่ห้อ, ชื่ออะไหล่, โซน)
- `/add` — เพิ่มอะไหล่ใหม่ (ถ่ายรูป + กรอกข้อมูล)

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
```

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
│   └── add/
│       └── page.js     ← หน้าเพิ่มอะไหล่
├── lib/
│   └── supabaseClient.js
├── package.json
├── next.config.mjs
└── .env.local.example
```

## ทดสอบว่าใช้ได้จริง
1. เปิด `/add` → ถ่ายรูป (หรือเลือกไฟล์) + กรอกชื่ออะไหล่ → กด "บันทึกอะไหล่"
2. จะเด้งกลับหน้าแรกอัตโนมัติ เห็นรายการที่เพิ่งเพิ่ม
3. ลองพิมพ์ค้นหา/เลือก filter ยี่ห้อ/โซน ดูว่ากรองถูกต้อง

## ยังไม่ทำใน MVP นี้ (ตามที่ตกลงกันไว้)
- ❌ Login / role แยกสิทธิ์
- ❌ AI auto-post ไปโซเชียล
- ❌ ระบบขาย/ชำระเงิน
- ❌ ข้อมูลลูกค้า (เก็บแยกจากระบบนี้โดยเจตนา)
