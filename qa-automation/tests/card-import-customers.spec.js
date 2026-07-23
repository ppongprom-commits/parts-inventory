// การ์ด "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory" — คืนวันที่ 21 ก.ค. 2026
// app/admin/import-customers/page.js + lib/csvImport.js (RFC 4180 parser ใหม่)
// ตัดสินใจของการ์ด: duplicate match ด้วยเบอร์โทรเท่านั้น -> skip (ไม่ merge/ไม่ทับ), บังคับมีอย่างน้อย
// ชื่อ หรือ เบอร์โทร, จำกัดสิทธิ์ owner/manager เท่านั้น
import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded, expectRoleForbidden } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

// ⚠️ test ในไฟล์นี้พึ่งลำดับการรัน (IMPORT-004 พึ่งว่า IMPORT-003 นำเข้า+อนุมัติ phoneA ไปก่อนแล้ว)
// — ⚠️ แก้ไข: playwright.config.js จริงตั้ง fullyParallel:TRUE (ไม่ใช่ false ตามที่คอมเมนต์เดิม
// อ้างไว้ผิด) แปลว่า test ในไฟล์เดียวกันสามารถถูกกระจายไปคนละ worker/รันสลับลำดับกันได้จริง — ต้อง
// ห่อด้วย test.describe.serial() เพื่อบังคับให้รันตามลำดับที่เขียนบน worker เดียวกันเสมอ ไม่งั้น
// IMPORT-003/004 จะพังแบบสุ่มเวลารันพร้อม worker อื่น (ไม่ใช่แค่ตอนแก้ approval flow รอบนี้)
//
// การ์ด "Admin Role (7th role)" (23 ก.ค. 2026): import_customers ตอนนี้ต้องผ่านคิวอนุมัติก่อน
// (pending_admin_actions, default requires_approval=true, approver_role="manager", owner
// อนุมัติได้เสมอเป็น fallback — ดู config/adminApprovalDefaults.js + db/admin_action_approval_migration.sql)
// ไม่ insert ตรงเข้า customers อีกต่อไป จนกว่าจะอนุมัติผ่าน /admin/admin-approvals
let mainShopId;
const runId = Date.now();
const phoneA = `08${String(runId).slice(-8)}`;
const phoneDup = `09${String(runId).slice(-8)}`;
const createdCustomerPhones = [phoneA, phoneDup];

function csvFile(content) {
  return { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(content, "utf-8") };
}

test.describe.serial("card-import-customers", () => {
  test.beforeAll(async () => {
    mainShopId = await getShopIdByName(currentShopName);
    // เคลียร์ pending_admin_actions ของ action_type นี้ที่อาจค้างจากรอบก่อนหน้าที่รันไม่จบ
    // (crash/timeout กลางทาง) กันปนกับรอบนี้ตอนไปหาไอเทมในคิวรออนุมัติ
    await adminClient().from("pending_admin_actions").delete().eq("shop_id", mainShopId).eq("action_type", "import_customers");
  });

  test.afterAll(async () => {
    await adminClient().from("customers").delete().eq("shop_id", mainShopId).in("phone", createdCustomerPhones);
    await adminClient().from("pending_admin_actions").delete().eq("shop_id", mainShopId).eq("action_type", "import_customers");
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

  test("IMPORT-003 ยืนยันนำเข้า -> เข้าคิวรออนุมัติก่อน (ไม่ insert ตรง) -> owner อนุมัติแล้วค่อยลง customers จริง", async ({
    page,
  }) => {
    const csv = `ชื่อ,เบอร์โทร,ที่อยู่\nQA คนที่หนึ่ง ${runId},${phoneA},123 ถนน QA\n`;

    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/import-customers");
    await page.locator('input[type="file"]').setInputFiles(csvFile(csv));

    await page.getByRole("button", { name: /ยืนยันนำเข้า/ }).click();
    // import_customers ขออนุมัติตาม default (requires_approval=true) เสมอ ไม่มี override ของร้านนี้
    await expect(page.getByTestId("import-result")).toContainText(
      "ส่งขออนุมัตินำเข้า 1 รายชื่อแล้ว — รอผู้จัดการ/เจ้าของอนุมัติก่อนจึงจะนำเข้าจริง (ข้าม 0 แถวข้อมูลไม่ครบ/ผิดรูปแบบ, ข้าม 0 แถวเบอร์โทรซ้ำ)",
      { timeout: 8000 }
    );

    // ต้องยังไม่มีแถวจริงใน customers เลย จนกว่าจะอนุมัติ
    const { data: beforeApproval } = await adminClient()
      .from("customers")
      .select("customer_id")
      .eq("shop_id", mainShopId)
      .eq("phone", phoneA);
    expect(beforeApproval).toEqual([]);

    // ต้องมีแถวรออนุมัติจริงใน pending_admin_actions พร้อม payload ที่ส่งไปถูกต้อง
    const { data: pendingRows } = await adminClient()
      .from("pending_admin_actions")
      .select("id, status, payload, action_type")
      .eq("shop_id", mainShopId)
      .eq("action_type", "import_customers")
      .eq("status", "pending");
    expect(pendingRows.length).toBe(1);
    expect(pendingRows[0].payload.rows).toEqual([
      { shop_id: mainShopId, name: `QA คนที่หนึ่ง ${runId}`, phone: phoneA, address: "123 ถนน QA" },
    ]);

    // ---- fuller flow: owner อนุมัติผ่าน UI จริงที่ /admin/admin-approvals แล้วต้องลง customers จริง ----
    await page.goto("/admin/admin-approvals");
    // การ์ด layout ไม่มี testid ต่อรายการ — "div" ที่มีข้อความนี้แมตช์ทั้ง ancestor (.app-shell,
    // .container) ด้วยเพราะ text อยู่ข้างในลึกๆ ต้องใช้ div ที่ "ไม่มี div ลูกที่ match ซ้ำ" (ใบสุดท้าย
    // ของ hierarchy) ถึงจะได้การ์ดรายการเดียวจริงๆ ที่มีปุ่มอนุมัติของแถวนี้อยู่ข้างใน
    const queueItem = page.locator("div", { hasText: "นำเข้าลูกค้า 1 รายชื่อ" }).filter({
      has: page.getByRole("button", { name: "✅ อนุมัติ" }),
    }).last();
    await expect(queueItem).toBeVisible({ timeout: 8000 });
    await queueItem.getByRole("button", { name: "✅ อนุมัติ" }).click();
    await expect(page.getByText("นำเข้าลูกค้า 1 รายชื่อ")).toHaveCount(0, { timeout: 8000 });

    const { data: afterApproval } = await adminClient()
      .from("customers")
      .select("name, phone, address")
      .eq("shop_id", mainShopId)
      .eq("phone", phoneA)
      .single();
    expect(afterApproval.name).toBe(`QA คนที่หนึ่ง ${runId}`);
    expect(afterApproval.address).toBe("123 ถนน QA");

    const { data: pendingAfter } = await adminClient()
      .from("pending_admin_actions")
      .select("status")
      .eq("shop_id", mainShopId)
      .eq("action_type", "import_customers")
      .eq("id", pendingRows[0].id)
      .single();
    expect(pendingAfter.status).toBe("approved");
  });

  test("IMPORT-004 นำเข้าเบอร์ที่ตรงกับลูกค้าที่มีอยู่แล้ว (อนุมัติแล้วจาก IMPORT-003) -> เช็คซ้ำ+ข้ามตั้งแต่ก่อนเข้าคิวอนุมัติเลย ไม่ทับข้อมูลเดิม", async ({
    page,
  }) => {
    // phoneA ถูก import + อนุมัติจนลง customers จริงแล้วจาก IMPORT-003 (รันตามลำดับในไฟล์เดียวกันแน่นอน
    // เพราะห่อด้วย test.describe.serial ด้านบน) — ลองนำเข้าเบอร์เดียวกันซ้ำอีกรอบด้วยชื่อที่ต่างออกไป
    // ต้องถูกข้ามตั้งแต่ก่อนเข้าคิวรออนุมัติเลย (handleConfirmImport เช็ค duplicate กับ customers จริง
    // ก่อนสร้าง pending row — ดู app/admin/import-customers/page.js: toInsert ว่าง เลยไม่มีการสร้าง
    // pending_admin_actions ใหม่ขึ้นมาเลยด้วยซ้ำ) ไม่ทับชื่อเดิม
    const csv = `ชื่อ,เบอร์โทร,ที่อยู่\nชื่อใหม่ที่ไม่ควรทับ,${phoneA},ที่อยู่ใหม่ที่ไม่ควรทับ\n`;

    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/import-customers");
    await page.locator('input[type="file"]').setInputFiles(csvFile(csv));

    await page.getByRole("button", { name: /ยืนยันนำเข้า/ }).click();
    await expect(page.getByTestId("import-result")).toContainText("ข้าม 1 แถว (เบอร์โทรซ้ำกับลูกค้าที่มีอยู่แล้ว)", {
      timeout: 8000,
    });
    // ไม่ใช่กรณีรออนุมัติ (toInsert ว่างตั้งแต่ต้น เพราะเบอร์นี้ซ้ำกับ customers จริงแล้ว)
    await expect(page.getByTestId("import-result")).not.toContainText("รอผู้จัดการ/เจ้าของอนุมัติ");

    const { data } = await adminClient().from("customers").select("name").eq("shop_id", mainShopId).eq("phone", phoneA).single();
    expect(data.name).toBe(`QA คนที่หนึ่ง ${runId}`); // ชื่อเดิมจาก IMPORT-003 ต้องไม่ถูกทับ

    // เช็คด้วยว่าไม่มี pending_admin_actions แถวใหม่เกิดขึ้นจากการนำเข้ารอบนี้เลย (dedupe ทำงานก่อน
    // ถึงขั้นตอนสร้างคิวรออนุมัติ) — ต้องมีแค่แถวเดียวจาก IMPORT-003 (สถานะ approved ไปแล้ว)
    const { data: allPending } = await adminClient()
      .from("pending_admin_actions")
      .select("id, status")
      .eq("shop_id", mainShopId)
      .eq("action_type", "import_customers");
    expect(allPending.length).toBe(1);
    expect(allPending[0].status).toBe("approved");
  });
});
