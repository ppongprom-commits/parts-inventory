# parts-inventory QA Automation — Login & RBAC

Playwright test automation + agent runner สำหรับฟีเจอร์ login/RBAC ของ [parts-inventory](https://github.com/ppongprom/parts-inventory) (branch: `staging`) รันกับ **staging deployment จริงบน Vercel**

> ⚠️ **ข้อจำกัดสำคัญ:** แพ็กเกจนี้ถูกสร้างขึ้นใน sandbox ที่ network เข้าถึงได้แค่ github/npm/pypi ฯลฯ — **เข้าถึง `*.vercel.app` ไม่ได้** ดังนั้นต้องเอาไปรันใน environment ที่มี network เต็ม เช่น เครื่อง local, Claude Code (ดู `AGENT_INSTRUCTIONS.md`), หรือ CI runner

## Prerequisites

- Node.js 18+ (แนะนำ 20 หรือ 22 LTS) — ถ้าใช้ Node 24/26 แล้ว `playwright install` ค้าง ดู Troubleshooting ด้านล่าง
- npm (มากับ Node)
- สิทธิ์เข้าถึง Supabase staging project (service_role/secret key) และรู้ URL ของ staging deployment จริงบน Vercel

## โครงสร้างไฟล์

```
qa-automation/
├── playwright.config.js         # config หลัก, baseURL มาจาก STAGING_BASE_URL
├── .env.example                 # copy เป็น .env แล้วกรอกค่าจริง
├── fixtures/
│   ├── auth-helpers.js          # selector จริงจาก app/login, app/staff-login, RequireAuth
│   ├── api-helpers.js           # ดึง access token + shop_id/member_id สำหรับเทสต์ที่ยิง API ตรง
│   ├── db-client.js             # sign-in client ตรงด้วย publishable key (RLS) + service-role helpers
│   ├── job-helpers.js           # กรอกฟอร์ม /jobs/new ตาม selector จริง
│   ├── test-assets/tiny.png     # ไฟล์รูปจิ๋วสำหรับเทสต์ photo upload
│   └── test-data.js             # โหลด credential จาก .env
├── tests/
│   ├── auth-email-login.spec.js     # TC-001,002,101,108-111
│   ├── auth-staff-login.spec.js     # TC-003,004,005,102-105
│   ├── rbac.spec.js                 # TC-201-204, TC-006
│   ├── account-status.spec.js       # TC-106, TC-107
│   ├── session.spec.js              # TC-301, TC-303
│   ├── api-rbac.spec.js             # TC-205 (a-d) — ยิง API ตรง ข้าม UI
│   ├── account-provisioning.spec.js # TC-401-404 — ⚠️ เปลี่ยน PIN จริงของ technician (ดู Known ordering issue ด้านล่าง)
│   ├── ui-ux-login.spec.js          # TC-501-504 — มี 2 เคสที่ "ตั้งใจปล่อยให้ fail" เพื่อ flag บั๊ก/gap จริง
│   ├── db-rls.spec.js                # TC-206 — RLS ตรงที่ DB ผ่าน publishable key ข้าม UI ทั้งหมด
│   ├── role-change-live.spec.js      # TC-207 — พิสูจน์ role change มีผลทันทีแบบ live ไม่ต้อง login ใหม่
│   ├── concurrent-session.spec.js    # TC-302 — ต้องใช้ shop แยก (plan=trial) เจอ finding สำคัญ 2 จุด
│   ├── job-00-schema-preflight.spec.js      # JOB-802 — เช็คตารางที่ schema file หายไปจาก repo ก่อนรันที่เหลือ
│   ├── job-creation-basic.spec.js           # JOB-001-004, 101-103, 402, 701
│   ├── job-creation-visibility-groups.spec.js # JOB-201-205 — 🔴 มี Critical bug (non-atomic insert)
│   ├── job-creation-workflow-steps.spec.js  # JOB-301, 303
│   ├── job-creation-photos.spec.js          # JOB-501-503
│   ├── job-creation-rbac.spec.js            # JOB-601-603
│   └── job-creation-multitenancy.spec.js    # JOB-801
├── scripts/
│   ├── setup-test-data.mjs      # สร้าง test account ทั้งหมดใน Supabase staging (idempotent)
│   └── teardown-test-data.mjs   # ลบ test data ทิ้งหลังจบรอบทดสอบ
├── agent/
│   ├── priority-map.js          # แม็ป TC ID -> priority (จาก test case xlsx)
│   └── run-and-report.mjs       # รัน playwright + สรุปผลเป็น QA report ภาษาไทย
└── AGENT_INSTRUCTIONS.md        # คู่มือให้ Claude Code/agent อื่นใช้รัน end-to-end
```

## Quick Start (local หรือ Claude Code)

```bash
npm install
npx playwright install chromium   # อย่าใส่ --with-deps บน macOS — flag นั้นมีไว้สำหรับ Linux (apt) เท่านั้น ไม่มีผลบน Mac

cp .env.example .env
# แก้ .env: ใส่ STAGING_BASE_URL, SUPABASE_URL (project URL เปล่าๆ ไม่มี /rest/v1 ต่อท้าย),
# SUPABASE_SERVICE_ROLE_KEY (หรือ secret key sb_secret_... ของระบบใหม่), และ credential ของ test account ทั้งหมด

npm run setup:data      # สร้าง test account บน staging (รันครั้งเดียว หรือรันซ้ำได้ ปลอดภัย — idempotent)
npm run agent:run       # รันเทสต์ทั้งหมด + สรุปผลเป็น test-results/agent-report.md

# รันเฉพาะบางไฟล์/บาง test:
npm run agent:run -- tests/rbac.spec.js
npm run agent:run -- --grep "TC-201"

# รันเฉพาะชุด job-creation (แนะนำรัน schema preflight ก่อนเสมอ):
npm run agent:run -- tests/job-00-schema-preflight.spec.js
npm run agent:run -- tests/job-creation-*.spec.js

# ดู HTML report แบบละเอียด (screenshot/trace ของ test ที่ fail):
npx playwright show-report test-results/html-report

# เก็บกวาดหลังทดสอบเสร็จ:
npm run teardown:data
```

## Schema จริงที่ script อ้างอิง (สำคัญถ้าจะแก้/ต่อยอด)

ตรวจสอบจาก `db/multi_tenant_schema_design.sql` และ `db/fresh_project_full_schema.sql` ของ repo จริง — **อย่าสมมติชื่อคอลัมน์เป็น `id` เฉยๆ**:

| ตาราง | Primary key | หมายเหตุ |
|---|---|---|
| `shops` | `shop_id` | `owner_user_id` เป็น `uuid NOT NULL` อ้างอิง `auth.users(id)` แบบ**ไม่มี** `ON DELETE CASCADE` — ต้องสร้าง auth user ของ owner ก่อนสร้าง shop เสมอ, และตอนลบต้องลบ `shops` ก่อนลบ auth user เสมอ |
| `shop_members` | `member_id` | `status` มีค่าได้แค่ `active` / `invited` / `disabled` |
| `platform_admins` | `user_id` | แยกจาก `shop_members` โดยสิ้นเชิง — user คนเดียวเป็นได้ทั้ง shop owner และ platform admin พร้อมกัน |

**`isDisabledAccount` ทำงานยังไงจริงๆ** (จาก `lib/AuthProvider.js`): คำนวณจาก "มีแถวใน `shop_members` อยู่จริงอย่างน้อย 1 แถว แต่ไม่มีแถวไหน `status='active'` เลย" — **ไม่เกี่ยวกับ `shops.subscription_status`** อย่างที่อาจเข้าใจผิดได้ตอนแรก `setup-test-data.mjs` จัดการเรื่องนี้ให้อัตโนมัติแล้วโดยตั้ง `shop_members.status='disabled'` ตรงๆ

## Troubleshooting

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'dotenv'` | ยังไม่ได้รัน `npm install` (หรือรันแล้วแต่ fail แบบเงียบๆ) | `npm install` แล้วเช็ค `ls node_modules \| grep dotenv` ว่ามีขึ้นจริง ถ้าไม่มี ลอง `rm -rf node_modules package-lock.json && npm cache clean --force && npm install` |
| `❌ Setup ล้มเหลว: Invalid path specified in request URL` | `SUPABASE_URL` ใน `.env` มี path ต่อท้าย (เช่น `/rest/v1`) ซ้ำกับที่ supabase-js เติมเอง | ตัดให้เหลือแค่ `https://<project-ref>.supabase.co` ไม่มี path/trailing slash ต่อท้าย (สคริปต์เวอร์ชันปัจจุบัน validate เรื่องนี้เองแล้ว จะ error ชัดเจนถ้าใส่ผิด) |
| `column shops.id does not exist` หรือ `column shop_members.id does not exist` | โค้ดเก่าอ้าง `id` แต่ schema จริงใช้ `shop_id`/`member_id` | แก้ไปแล้วใน `setup-test-data.mjs`/`teardown-test-data.mjs` เวอร์ชันปัจจุบัน ถ้าเจอ error นี้อีกแปลว่าไฟล์เก่าอยู่ ให้ดึงเวอร์ชันล่าสุด |
| `playwright install` ค้างไม่จบบน macOS (พบกับ Node 24.x/26.x บางเวอร์ชัน) | บั๊กที่รู้จักของ Playwright + Node เวอร์ชันใหม่มากบน macOS arm64 | ลอง `nvm use 22` แล้วรัน `npx playwright install chromium` ใหม่ (Node 22 LTS ยืนยันว่าใช้ได้ปกติ) |
| foreign key violation ตอน `teardown:data` ลบ auth user | ลบ `shops` ไม่ทันหรือลบผิดลำดับ (ต้องลบ shops ก่อนเสมอเพราะ `owner_user_id` ไม่มี cascade) | สคริปต์ปัจจุบันลบ shops ก่อนอยู่แล้ว (`deleteTestShops()` รันก่อน `deleteUserEverywhere()`) ถ้ายัง fail ให้เช็คว่ามี shop อื่นที่ไม่อยู่ใน `TEST_SHOP_NAMES` list แอบอ้างอิง user นั้นอยู่ไหม |

## Coverage เทียบกับ test_cases_login_rbac_parts_inventory.xlsx

| กลุ่ม | Automated | หมายเหตุ |
|---|---|---|
| Positive email/staff login (TC-001–005) | ✅ | |
| Negative login/validation (TC-101–111) | ✅ | TC-104 เป็น observational test (ดู AGENT_INSTRUCTIONS.md) |
| RBAC per-page (TC-201–204) | ✅ | |
| RBAC API-level (TC-205) | ✅ | 4 sub-case (a-d): reject ไม่มีสิทธิ์, reject ไม่มี token, self-service reset ต้องผ่าน |
| RLS ที่ DB (TC-206) | ✅ | ยิงตรงด้วย publishable key (ไม่ผ่าน UI) — cross-tenant isolation, zones/jobs update-delete ตาม role |
| Role change mid-session (TC-207) | ✅ | พิสูจน์ว่า `is_shop_member()` query สดทุก request — เปลี่ยน status กลางคันมีผลทันทีโดยไม่ต้อง login ใหม่ |
| Account status (TC-106, 107) | ✅ | `setup:data` ตั้งค่า `shop_members.status='disabled'` ให้อัตโนมัติแล้ว ไม่มี manual step เหลือ |
| Session/Idle (TC-301, 303) | ✅ | ใช้ Playwright clock mocking fast-forward 15 นาที ไม่ต้องรอจริง |
| Session concurrent (TC-302) | ✅ | ต้องใช้ shop แยก (plan=trial) — เจอ finding สำคัญ 2 จุด (ดูด้านล่าง) |
| Account provisioning (TC-401–404) | ✅ | ⚠️ ดู "Known ordering issue" ด้านล่าง — TC-403 แก้ expectation จริงจากที่ตั้งคำถามไว้ก่อนหน้า (manager สร้าง staff ได้ ไม่ใช่ owner เท่านั้น) |
| UI/UX (TC-501–504) | ✅ (บางส่วน) | TC-501 (ปุ่มโชว์/ซ่อนรหัสผ่าน) `test.skip` เพราะฟีเจอร์นี้ไม่มีอยู่จริงในแอป; TC-504b ตั้งใจปล่อยให้ FAIL เพื่อ flag บั๊กจริงที่เจอ (ดูด้านล่าง) |

## บั๊ก/ช่องว่างที่เจอจากการอ่านโค้ดจริงตอนเขียนเทสต์ (ไม่ใช่แค่สมมติฐาน)

- **`app/login/page.js` โชว์ error message ภาษาอังกฤษของ Supabase หลุดออกมา** — โค้ดต่อ `"เข้าสู่ระบบไม่สำเร็จ: " + error.message` ตรงๆ ซึ่ง `error.message` มักเป็นอังกฤษ (เช่น "Invalid login credentials") ต่างจาก `/staff-login` ที่ hardcode ข้อความไทยล้วนไม่ต่อ error.message เลย — ดู `TC-504b` ใน `ui-ux-login.spec.js` (ตั้งใจปล่อยให้ fail เพื่อ track ปัญหานี้)
- **ไม่มีปุ่มโชว์/ซ่อนรหัสผ่านในทั้ง `/login` และ `/staff-login`** — เป็น `test.skip` ใน `TC-501`
- **ไม่มี UI สำหรับ reset PIN ใน `/admin/team`** — API route `/api/team/reset-pin` มีอยู่จริงและทำงานได้ (มี self-service branch ด้วย) แต่ยังไม่ถูกผูกกับปุ่มใดๆ ในหน้า — `TC-404` จึงเทสต์ผ่าน API ตรงแทน UI
- **shop ใหม่ default เป็น plan `trial` (maxMembers: 3)** — ถ้าไม่ตั้ง `subscription_plan: 'enterprise'` ให้ QA Test Shop ตอน setup, การเทสต์สร้าง staff เพิ่ม (TC-401/403) จะ fail เพราะชนเพดานที่นั่ง ไม่ใช่บั๊กจริง — แก้ไว้ใน `setup-test-data.mjs` แล้ว

- **shop ใหม่ default เป็น plan `trial` (maxMembers: 3)** — ถ้าไม่ตั้ง `subscription_plan: 'enterprise'` ให้ QA Test Shop ตอน setup, การเทสต์สร้าง staff เพิ่ม (TC-401/403) จะ fail เพราะชนเพดานที่นั่ง ไม่ใช่บั๊กจริง — แก้ไว้ใน `setup-test-data.mjs` แล้ว
- **`sessionError` (ข้อความ "อู่นี้มีคนใช้งานพร้อมกันเต็มแล้ว...") ไม่ถูก render ที่ไหนใน UI เลย** — ผู้ใช้ที่ login ไม่สำเร็จเพราะชน concurrent-session cap จะแค่เห็นหน้า `/login` เด้งกลับมาเฉยๆ โดยไม่รู้เหตุผล (`TC-302a` ใน `concurrent-session.spec.js`)
- **`maxDevicesPerUser` (=2) นับจำนวนได้ แต่ไม่ได้บังคับเตะอุปกรณ์เกินจำนวนออกจริง** — ตอนอุปกรณ์ที่ 3 login, ระบบแค่ลบแถวใน `user_sessions` ของอุปกรณ์เก่าสุดทิ้ง (bookkeeping) แต่ไม่เรียก `signOut()` ให้อุปกรณ์นั้น เลยยังใช้งานต่อได้ปกติทุกประการ ทั้งที่ตามชื่อ configควรจะจำกัดจริง (`TC-302b`)

## Findings จาก TC-206/207 (RLS โดยตรง)

- `is_shop_member()` เป็น `stable` SQL function ที่ query `shop_members` สดทุกครั้ง (ไม่ cache ใน JWT) — เปลี่ยน role/status กลางคันมีผลทันทีจริง ไม่ต้องรอ session หมดอายุหรือ login ใหม่ (`TC-207` พิสูจน์โดยไม่ sign in ซ้ำเลยตลอดทั้งเทสต์)
- ยืนยันด้วยว่า `platform_admins` ไม่มี RLS policy ใดๆ เลยตามที่ comment ในไฟล์ schema บอกไว้ — เข้าถึงไม่ได้แม้แต่ owner ของอู่ตัวเองผ่าน publishable key (ต้อง service_role เท่านั้น) — พฤติกรรมนี้ตรงตามที่ตั้งใจออกแบบไว้ (ไม่ใช่บั๊ก แต่เป็นจุดที่ควร regression-test ไว้กันเผลอเพิ่ม policy หลวมๆ ในอนาคต)

## Known ordering issue: `account-provisioning.spec.js` เปลี่ยน PIN จริง

`TC-404` ใน `account-provisioning.spec.js` รีเซ็ต PIN ของ technician test account เป็นค่าใหม่ (`778899`) ผ่าน API จริง ถ้า suite อื่นที่ hardcode `accounts.technician.pin` เดิม (เช่น `auth-staff-login.spec.js`, `rbac.spec.js`, `api-rbac.spec.js`) รันหลังจากไฟล์นี้ในรอบเดียวกัน จะ login ไม่ผ่านเพราะ PIN ไม่ตรงกับที่ตั้งไว้ใน `.env` อีกต่อไป

วิธีจัดการ (เลือกอย่างใดอย่างหนึ่ง):
1. **แนะนำ:** รัน `npm run setup:data` ใหม่หลังจากรัน `account-provisioning.spec.js` ทุกครั้ง (script เป็น idempotent จะ sync PIN ให้ตรงกับ `.env` อีกครั้ง)
2. รัน `account-provisioning.spec.js` แยกเป็นคำสั่งสุดท้ายเสมอ: `npm run agent:run -- --grep-invert "TC-404"` ก่อน แล้วค่อยรัน TC-404 แยกท้ายสุด
3. เพิ่ม `test.afterAll` ใน `account-provisioning.spec.js` ให้เรียก reset-pin กลับเป็นค่าเดิมอัตโนมัติ (ยังไม่ได้ทำในเวอร์ชันนี้ — ทำได้ถ้าต้องการ)

## Job Creation Test Suite (`job-*.spec.js`)

Test case เต็ม (เหตุผล/precondition/expected result ของทุก JOB-xxx) อยู่ในแชทที่ออกแบบไว้ — ไฟล์นี้สรุปเฉพาะส่วนที่เกี่ยวกับการรันอัตโนมัติ

### ⚠️ ข้อกำหนดก่อนรัน: ไฟล์ schema หายไปจาก repo

`db/job_multi_group_migration.sql` และ `README.md` ของโปรเจกต์เอง (หัวข้อ "Phase E") อ้างถึงไฟล์ `db/visibility_groups_and_workflow_schema.sql` ที่ต้องรันก่อน — **แต่ไฟล์นี้ไม่มีอยู่จริงในทั้ง repo** (grep ทั้ง repo แล้วไม่เจอ) ตารางที่ไฟล์นี้ควรจะสร้าง (`visibility_groups`, `visibility_group_members`, `job_workflow_steps`) น่าจะถูก apply ตรงเข้า staging DB มาก่อนแล้ว (ยืนยันจากที่ `/admin/groups` page ใช้งานได้จริงในโค้ด) แต่ไฟล์ `.sql` ต้นทางไม่เคย commit เข้า git

**`tests/job-00-schema-preflight.spec.js` (JOB-802) เช็คเรื่องนี้ให้อัตโนมัติ** — รันไฟล์นี้ก่อนเสมอ ถ้า fail แปลว่า environment ที่ทดสอบยังไม่มี migration นี้จริง ต้องขอ schema จากทีม dev ก่อน ไม่ต้องไล่ debug test อื่นทีละตัว

### 🔴 บั๊ก Critical ที่สุดในชุดนี้: JOB-202/203

`app/jobs/new/page.js` insert `jobs` และ insert `job_visibility_groups` เป็นคนละ request แยกกัน **ไม่ใช่ transaction เดียว** ถ้า request ที่ 2 fail หลัง request แรกสำเร็จ:
1. งานที่มีข้อมูลลูกค้าเต็มถูกบันทึกไปแล้วจริงใน DB
2. ไม่มีการผูก visibility group เลย → **งานนั้นกลายเป็นเห็นได้ทุกคนในอู่ทันที** ทั้งที่ผู้ใช้ตั้งใจจำกัดกลุ่ม (ตาม `can_view_job()`: "ไม่มีกลุ่มผูกไว้ = เห็นได้ทุกคน")
3. ผู้ใช้เห็นแค่ "บันทึกไม่สำเร็จ" เข้าใจผิดว่าไม่มีอะไรถูกบันทึกเลย
4. ถ้ากด submit ซ้ำ (เพราะคิดว่ายัง fail อยู่) → เกิดงานซ้ำสำหรับลูกค้าคนเดียวกัน

`tests/job-creation-visibility-groups.spec.js` จำลองสถานการณ์นี้จริงด้วย `page.route(...).abort()` เฉพาะ request ที่ 2 แล้วยืนยันทั้ง 2 ผลลัพธ์ (privacy leak + duplicate job) ด้วยการเช็ค DB ตรงและเช็ค RLS ว่า role อื่นเห็นงานได้จริงทั้งที่ไม่ควร

**คำแนะนำสำหรับทีม dev:** ย้าย logic นี้เป็น Postgres RPC เดียว (`create_job_with_groups_and_steps(...)`) ที่ insert ทั้ง 3 ตาราง (`jobs`, `job_visibility_groups`, `job_workflow_steps`) ใน transaction เดียวกัน แทนการยิง 3 request แยกจากฝั่ง client เหมือนปัจจุบัน — มี pattern เดียวกันนี้ให้ดูตัวอย่างอยู่แล้วใน `create_shop_and_owner()`/`update_member_role()` ที่ทำถูกด้วย `security definer` function

### Findings อื่นที่เจอระหว่างเขียนชุดนี้

- `/jobs/new` **ไม่มี field ไหน required เลยแม้แต่ตัวเดียว** (ต่างจาก `/add` ที่บังคับ part_name+รูป) — สร้างงานเปล่าได้ (JOB-002)
- ลูกค้าเดิม (เบอร์ซ้ำ) ถูก reuse แต่**ชื่อ/ที่อยู่ใน `customers` table ไม่ถูกอัปเดต**ตามข้อมูลใหม่ที่กรอกรอบหลัง (JOB-101) — ข้อมูลลูกค้ากลางจะเก่าค้างตลอดไป
- `assistant` สร้างงานได้ แต่**แก้ไข/อัปเดตสถานะงานที่ตัวเองสร้างไม่ได้เลย** เพราะ update policy ของ `jobs` ไม่รวม assistant (JOB-602)
- shop suspended/canceled บล็อกการสร้างงานที่ระดับ RLS (`is_shop_active()`) แต่ error ที่เห็นเป็น raw Postgres message เหมือน pattern ที่เจอใน `/login` (JOB-603)
- label "ที่อยู่ลูกค้า (จำเป็นสำหรับออกใบกำกับภาษี)" ไม่มี `required` จริง — บังคับแค่ข้อความ ไม่บังคับจริงในฟอร์ม

### ข้อจำกัดของชุดนี้ (ยังไม่ automate)

- **JOB-403 (แผนภาพจุดเสียหาย/`CarDamageDiagram`)** — ยังไม่ได้เปิดโค้ด component นี้ดู เป็น canvas/SVG แบบแตะมาร์กจุด ซับซ้อนกว่าฟอร์ม text ทั่วไป แนะนำทำเป็นเฟสแยกถ้าต้องการ automate
- **JOB-302 (มอบหมายงานให้สมาชิกที่เพิ่งถูกปิดใช้งานระหว่างฟอร์มเปิดค้าง)** — edge case ที่ severity ต่ำ ข้ามไปก่อน
- **JOB-702 (ปุ่มถ่ายรูป disable ระหว่าง resize)** — pattern เดียวกับ JOB-701 ที่ทำแล้ว severity ต่ำกว่า ข้ามไปก่อนเพื่อประหยัดเวลา

## Changelog (แก้ไขจากการรันจริงกับ staging)

- แก้ `SUPABASE_URL` validation ให้ error ชัดเจนถ้ามี path ต่อท้าย
- แก้ `shops`/`shop_members` ให้ใช้ primary key จริง (`shop_id`/`member_id` แทน `id`)
- แก้ TC-106 (disabled account) ให้ตั้งค่าอัตโนมัติผ่าน `shop_members.status='disabled'` แทนการเดา `shops.subscription_status`
- แก้ลำดับการลบใน `teardown-test-data.mjs`: ลบ `shops` ก่อนลบ auth user เสมอ (กัน FK violation)
- เพิ่ม shop สำหรับ TC-006 (platform admin) แยกเป็นอู่ของตัวเอง กันชนกับ owner หลัก
- **เฟส 2:** เพิ่ม TC-205 (API-level RBAC), TC-401–404 (account provisioning), TC-501–504 (UI/UX login) — เจอบั๊ก/gap จริง 3 จุดระหว่างเขียน (ดูหัวข้อ "บั๊ก/ช่องว่างที่เจอ" ด้านบน) และแก้ seat-limit ของ QA Test Shop เป็น plan enterprise ก่อนจะชนเพดาน trial (3 คน) ที่มีอยู่แล้ว 5 คน
- **เฟส 3:** เพิ่ม TC-206 (RLS โดยตรง), TC-207 (role change live), TC-302 (concurrent session) — ครบทุก TC ในเอกสาร test case ต้นฉบับแล้ว เจอ finding เพิ่มอีก 2 จุดเรื่อง session/device limit ที่ทำงานไม่ตรงกับชื่อ config 100% (ดูหัวข้อ "Findings จาก TC-206/207" และย่อหน้าบั๊ก/ช่องว่างด้านบน) — เพิ่ม `SUPABASE_PUBLISHABLE_KEY` และ 4 บัญชี `qa_concurrent1-4` ใน `.env`/setup script สำหรับ TC-302 โดยเฉพาะ

ครบทุก TC ในเอกสารต้นฉบับแล้ว (TC-001 ถึง TC-504) เหลือแค่ TC ใหม่ที่อาจเพิ่มทีหลังตามฟีเจอร์อื่น (เช่น job creation) ถ้าต้องการให้ automate ต่อ

- **เฟส 4:** เพิ่มชุด Job Creation (JOB-001 ถึง JOB-801 + JOB-802 schema preflight) — เจอบั๊ก Critical จริง 1 ตัว (non-atomic visibility-group insert ทำให้งานหลุดเป็น public + เสี่ยง duplicate job, ดูหัวข้อ "Job Creation Test Suite" ด้านบน) และเจอไฟล์ schema migration ที่หายไปจาก repo ทั้งที่ README ของโปรเจกต์เองอ้างถึง
