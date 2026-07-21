# คำสั่งสำหรับ Agent (Claude Code) — parts-inventory QA Automation

ไฟล์นี้เขียนไว้ให้ Claude Code (หรือ agent ตัวอื่นที่มี network เข้าถึง staging จริง) อ่านแล้วรันชุดทดสอบนี้ได้เองแบบ end-to-end โดยไม่ต้องถามคนทุกขั้นตอน

## บริบท

Repo นี้ทดสอบฟีเจอร์ login/RBAC + job creation + (ตั้งแต่คืน 21 ก.ค. 2026) ฟีเจอร์ใหม่อีก 13 การ์ด
ของ `parts-inventory` (github.com/ppongprom/parts-inventory, branch: staging) กับ staging deployment
จริงบน Vercel Role ในระบบ: `owner`, `manager`, `supervisor`, `technician`, `assistant`, `field_scanner`
(ระดับอู่ — field_scanner เพิ่มคืน 21 ก.ค.) + `platform_admin` (ตารางแยก) — ดูรายละเอียดเต็มใน
`../test_cases_login_rbac_parts_inventory.xlsx` (login/RBAC) และหัวข้อ "คืนวันที่ 21 ก.ค. 2026" ใน
`README.md` ของไดเรกทอรีนี้ (ฟีเจอร์ใหม่)

⚠️ **ชุด test ของคืน 21 ก.ค. 2026 (`tests/card-*.spec.js` ที่ไม่ใช่ `card-android-camera-recovery`
ฯลฯ — ดูรายชื่อเต็มในหัวข้อ "โครงสร้างไฟล์" ด้านบน) ยังไม่เคยถูกรันจริงสักครั้ง** เขียนจากการอ่านโค้ด/
schema/RLS จริงเท่านั้น (sandbox ที่เขียนไม่มี network ออก staging) ถ้า agent รันแล้วเจอ fail จำนวนมาก
ในชุดนี้โดยเฉพาะ ให้สงสัยว่า selector คลาดเคลื่อนก่อน (ไปเปิดไฟล์ page.js จริงเทียบ) อย่าเพิ่งสรุปว่า
แอปมีบั๊กจริงทันที — ต่างจากชุด TC-xxx/JOB-xxx เดิมที่ผ่านการรันจริงมาแล้วหลายรอบ (ดู Changelog)

## ขั้นตอนที่ต้องทำ (ตามลำดับ)

1. **ติดตั้ง dependencies**
   ```bash
   npm install
   npx playwright install chromium
   # บน Linux/CI เท่านั้น ใช้ --with-deps แทนเพื่อติดตั้ง system libraries ด้วย:
   #   npx playwright install --with-deps chromium
   # (บน macOS flag นี้ไม่มีผล และ Node 24/26 บาง build มีบั๊กทำให้ install ค้าง —
   #  ถ้าเจอ ให้ลอง `nvm use 22` แล้วรันใหม่)
   ```

2. **ตรวจสอบว่ามี `.env` หรือยัง**
   - ถ้ายังไม่มี: copy จาก `.env.example` แล้ว**ถามผู้ใช้**ให้กรอกค่าจริง (STAGING_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, **SUPABASE_PUBLISHABLE_KEY** — ใช้กับ TC-206/207/302 ที่ต้องยิง Supabase ตรงด้วย publishable key เดียวกับแอปจริง) — ห้ามเดาหรือสร้างค่าปลอมเอง เพราะ service_role key ต้องเป็นของจริงถึงจะสร้าง test data ได้
   - ห้าม log หรือ print ค่าใน `.env` ออกมาให้เห็นเต็มๆ ใน output (โดยเฉพาะ SERVICE_ROLE_KEY)

3. **Setup test data** (รันครั้งแรก หรือทุกครั้งที่สงสัยว่า staging data เพี้ยน)
   ```bash
   npm run setup:data
   ```
   สคริปต์นี้ idempotent — รันซ้ำได้ไม่พัง จะ sync password/role ให้ตรงกับ `.env` เสมอ

4. **รันชุดทดสอบผ่าน agent runner** (ไม่ใช่ `npm test` ตรงๆ เพราะ agent runner จะ parse ผลและจัดลำดับความสำคัญให้)
   ```bash
   npm run agent:run
   ```
   - รันเฉพาะบางไฟล์: `npm run agent:run -- tests/rbac.spec.js`
   - รันเฉพาะบาง TC: `npm run agent:run -- --grep "TC-201"`

5. **อ่านผลจาก `test-results/agent-report.md`** แล้วตัดสินใจตามนี้:
   - **มี Critical fail** → หยุด, อย่าไปแก้โค้ด production เอง, สรุปให้ผู้ใช้เป็นภาษาไทยว่า TC ไหน fail เพราะอะไร (ดึง error message สั้นๆ จาก report), แนบ path ของ trace/screenshot ที่ Playwright เก็บไว้ (`test-results/html-report`)
   - **มีแค่ High/Medium fail** → สรุปให้ผู้ใช้ทราบ ถามว่าจะให้แก้ต่อไหมหรือรอ
   - **ผ่านหมด** → สรุปสั้นๆ ว่าผ่านกี่ test พร้อม link ไป HTML report
   - **`TC-504b` fail** → เป็นเรื่องปกติ ไม่ใช่ agent พังหรือ setup ผิด — test นี้ตั้งใจเขียนให้ fail เพื่อ flag บั๊กจริงที่เจอ (`/login` โชว์ error message ภาษาอังกฤษของ Supabase หลุดออกมา) อย่ารายงานเป็น Critical incident แต่ให้สรุปว่าเป็น known finding ที่รอทีม dev ตัดสินใจ
   - **`JOB-202`/`JOB-203` fail** → เช่นเดียวกัน เป็นเรื่องปกติ ตั้งใจเขียนให้ fail เพื่อยืนยันบั๊ก non-atomic insert ที่เจอจริง (ดู README หัวข้อ "Job Creation Test Suite") — ไม่ต้อง debug เพิ่ม สรุปเป็น known Critical finding ที่ต้องแจ้งทีม dev
   - **`job-00-schema-preflight.spec.js` (JOB-802) fail** → หยุดก่อน อย่าพยายามรัน `job-creation-*.spec.js` ต่อ เพราะ table ที่จำเป็นยังไม่มีใน environment นี้จริง (ดู README หัวข้อ schema ที่หายไป) แจ้งผู้ใช้ให้ไปหา schema จากทีม dev ก่อน

5.5. **ระวังลำดับการรัน `account-provisioning.spec.js`** — ไฟล์นี้มี `TC-404` ที่เปลี่ยน PIN จริงของ technician test account ผ่าน API หลังรันไฟล์นี้แล้ว ให้รัน `npm run setup:data` ซ้ำอีกครั้งก่อนรัน suite อื่นที่ใช้ `accounts.technician` (setup เป็น idempotent, sync PIN กลับให้ตรงกับ `.env` ให้อัตโนมัติ) ไม่งั้น test ไฟล์อื่นจะ fail เพราะ PIN ไม่ตรง ไม่ใช่เพราะแอปมีบั๊ก

6. **ถ้า selector ใช้ไม่ได้แล้ว (โค้ดจริงเปลี่ยน markup)**
   - เปิดไฟล์จริงใน repo `parts-inventory` (clone branch staging มาเทียบ) เช่น `app/login/page.js`, `app/staff-login/page.js`, `components/RequireAuth.js`
   - แก้ selector ใน `fixtures/auth-helpers.js` ให้ตรงกับของจริง **ที่เดียว** (ไฟล์อื่นอ้างอิงจากตรงนี้หมด)
   - อย่าแก้ selector กระจายไปหลายไฟล์ test เพราะจะ sync ยาก

7. **Teardown หลังจบงาน** (ถ้าผู้ใช้บอกว่าจบรอบทดสอบแล้ว หรือจะไม่ใช้ staging ต่อสักพัก)
   ```bash
   npm run teardown:data
   ```
   ยืนยันกับผู้ใช้ก่อนรันเสมอ เพราะเป็นการลบข้อมูลจริงใน staging DB

## กติกาความปลอดภัยที่ agent ต้องเคารพเสมอ

- ห้ามรันสคริปต์ setup/teardown กับ URL ที่ดูเหมือน production (ไม่มีคำว่า staging/dev/test ใน `SUPABASE_URL`) โดยไม่ถามผู้ใช้ก่อน — สคริปต์มี warning ในตัวอยู่แล้ว แต่ agent ต้องอ่าน warning นั้นจริงๆ ไม่ใช่ pipe ผ่านไปเฉยๆ
- ห้าม commit ไฟล์ `.env` จริงเข้า git
- Test เกี่ยวกับ SQL injection/XSS (`TC-110`, `TC-111`) มีไว้ตรวจสอบว่าแอป **ป้องกันได้** เท่านั้น ห้ามขยายผลไปทดสอบเทคนิคโจมตีอื่นเพิ่มเติมกับ staging จริงโดยไม่ได้รับอนุญาต
- ถ้า test ใดๆ ดูเหมือนเปิดช่องให้ agent เข้าถึงข้อมูลของ shop อื่นที่ไม่ใช่ QA test shop โดยไม่ตั้งใจ ให้หยุดและแจ้งผู้ใช้ทันที แทนที่จะไปสำรวจต่อ

## หมายเหตุเรื่อง TC-104 (username format validation)

Test นี้เขียนแบบ "สังเกตพฤติกรรม" ไม่ assert ผลลัพธ์ตายตัว เพราะตอนตรวจสอบโค้ด (`lib/staffAuth.js`) พบว่ามี `isValidUsername()`/`isValidPin()` แต่ **ยังไม่ยืนยันว่าฟอร์มจริงเรียกใช้ฟังก์ชันนี้ก่อน submit หรือปล่อยให้ backend/Supabase reject เอง** — ถ้า agent รันแล้วพบว่าไม่มี client-side validation เลย ให้รายงานเป็นข้อสังเกต (ไม่ใช่ bug ที่ block release) และแนะนำให้ dev เพิ่ม validation ฝั่ง UI
