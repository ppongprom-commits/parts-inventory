// การ์ด "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory" — คืนวันที่ 21 ก.ค. 2026
// app/admin/import-customers/page.js + lib/csvImport.js (RFC 4180 parser ใหม่)
// ตัดสินใจของการ์ด: duplicate match ด้วยเบอร์โทรเท่านั้น -> skip (ไม่ merge/ไม่ทับ), บังคับมีอย่างน้อย
// ชื่อ หรือ เบอร์โทร, จำกัดสิทธิ์ owner/manager เท่านั้น
import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded, expectRoleForbidden } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

// ⚠️ test ในไฟล์นี้พึ่งลำดับการรัน (IMPORT-004 พึ่งว่า IMPORT-003 นำเข้า phoneA ไปก่อนแล้ว) —
// ใช้ได้เพราะ playwright.config.js ตั้ง fullyParallel:false ทั้งโปรเจกต์ (test ในไฟล์เดียวกันรัน
// เรียงตามลำดับที่เขียนเสมอ ไม่ใช่ขนาน) เหมือน pattern เดิมที่ใช้อยู่แล้วใน account-provisioning.spec.js
let mainShopId;
const runId = Date.now();
const phoneA = `08${String(runId).slice(-8)}`;
const phoneDup = `09${String(runId).slice(-8)}`;
const createdCustomerPhones = [phoneA, phoneDup];

function csvFile(content) {
  return { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(content, "utf-8") };
}

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");
});

test.afterAll(async () => {
  await adminClient().from("customers").delete().eq("shop_id", mainShopId).in("phone", createdCustomerPhones);
});

test("IMPORT-001 supervisor เข้าหน้านี้ไม่ได้ (owner/manager เท่านั้น)", async ({ page }) => {
  await loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin);
  await expectLoginSucceeded(page);
  await page.goto("/admin/import-customers");
  await expectRoleForbidden(page, "supervisor");
});

test("IMPORT-002 อัปโหลด CSV -> auto-guess column mapping ถูกต้องจากหัวตารางภาษาไทย + พรีวิว validate ราย row", async ({ page }) => {
  const csv =
    `ชื่อ,เบอร์โทร,ที่อยู่\n` +
    `QA คนที่หนึ่ง ${runId},${phoneA},123 ถนน QA\n` +
    `,,ไม่มีทั้งชื่อและเบอร์\n` +
    `QA ซ้ำในไฟล์,${phoneDup},ที่อยู่ A\n` +
    `QA ซ้ำในไฟล์2,${phoneDup},ที่อยู่ B\n`;

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/admin/import-customers");

  await page.locator('input[type="file"]').setInputFiles(csvFile(csv));

  // auto-guess: "ชื่อ" -> name, "เบอร์โทร" -> phone, "ที่อยู่" -> address
  await expect(page.getByTestId("mapping-row-ชื่อ").locator("select")).toHaveValue("name");
  await expect(page.getByTestId("mapping-row-เบอร์โทร").locator("select")).toHaveValue("phone");
  await expect(page.getByTestId("mapping-row-ที่อยู่").locator("select")).toHaveValue("address");

  // 4 แถวทั้งหมด: แถว "คนที่หนึ่ง" ผ่าน, แถวไม่มีชื่อ/เบอร์เลยไม่ผ่าน, คู่เบอร์ซ้ำกันเองในไฟล์ —
  // เฉพาะแถวที่ 2 ของคู่ซ้ำ (เจอทีหลัง) เท่านั้นที่ถูก flag ว่า duplicateInFile (ตัว seenPhonesInFile
  // เช็คแบบ "เจอซ้ำ" ไม่ใช่ "เจอมากกว่า 1 ครั้ง" ตามโค้ดจริงใน app/admin/import-customers/page.js —
  // แถวแรกของคู่ซ้ำเลยผ่านการตรวจสอบตามปกติ) รวมผ่าน 2 แถว (คนที่หนึ่ง + แถวแรกของคู่ซ้ำ), ไม่ผ่าน 2 แถว
  await expect(page.getByTestId("preview-summary")).toContainText("ทั้งหมด 4 แถว");
  await expect(page.getByTestId("preview-summary")).toContainText("ผ่านการตรวจสอบ 2 แถว");
  await expect(page.getByTestId("preview-summary")).toContainText("มีปัญหา 2 แถว");
  await expect(page.getByTestId("invalid-rows-list")).toContainText("เบอร์โทรซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน");
});

test("IMPORT-003 ยืนยันนำเข้า -> insert ลูกค้าใหม่จริงใน DB พร้อมชื่อ/เบอร์/ที่อยู่ถูกต้อง", async ({ page }) => {
  const csv = `ชื่อ,เบอร์โทร,ที่อยู่\nQA คนที่หนึ่ง ${runId},${phoneA},123 ถนน QA\n`;

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/admin/import-customers");
  await page.locator('input[type="file"]').setInputFiles(csvFile(csv));

  await page.getByRole("button", { name: /ยืนยันนำเข้า/ }).click();
  await expect(page.getByTestId("import-result")).toContainText("นำเข้าสำเร็จ 1 รายชื่อ", { timeout: 8000 });

  const { data } = await adminClient()
    .from("customers")
    .select("name, phone, address")
    .eq("shop_id", mainShopId)
    .eq("phone", phoneA)
    .single();
  expect(data.name).toBe(`QA คนที่หนึ่ง ${runId}`);
  expect(data.address).toBe("123 ถนน QA");
});

test("IMPORT-004 นำเข้าเบอร์ที่ตรงกับลูกค้าที่มีอยู่แล้ว -> ข้าม ไม่สร้างซ้ำ ไม่ทับข้อมูลเดิม", async ({ page }) => {
  // phoneA ถูก import เข้าไปแล้วจาก IMPORT-003 (รันตามลำดับในไฟล์เดียวกัน อยู่แล้ว) — ลองนำเข้าเบอร์
  // เดียวกันซ้ำอีกรอบด้วยชื่อที่ต่างออกไป ต้องถูกข้าม ไม่ทับชื่อเดิม
  const csv = `ชื่อ,เบอร์โทร,ที่อยู่\nชื่อใหม่ที่ไม่ควรทับ,${phoneA},ที่อยู่ใหม่ที่ไม่ควรทับ\n`;

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/admin/import-customers");
  await page.locator('input[type="file"]').setInputFiles(csvFile(csv));

  await page.getByRole("button", { name: /ยืนยันนำเข้า/ }).click();
  await expect(page.getByTestId("import-result")).toContainText("ข้าม 1 แถว (เบอร์โทรซ้ำกับลูกค้าที่มีอยู่แล้ว)", {
    timeout: 8000,
  });

  const { data } = await adminClient().from("customers").select("name").eq("shop_id", mainShopId).eq("phone", phoneA).single();
  expect(data.name).toBe(`QA คนที่หนึ่ง ${runId}`); // ชื่อเดิมจาก IMPORT-003 ต้องไม่ถูกทับ
});
