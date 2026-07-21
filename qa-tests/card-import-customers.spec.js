// Card: "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory"
//
// ขอบเขต/ตัดสินใจ — ดูเหตุผลเต็มใน db/import_customers_migration.sql:
//  - Duplicate: match ด้วยเบอร์โทรเท่านั้น -> skip ถ้าซ้ำกับที่มีอยู่แล้ว (ไม่ merge/ไม่ทับ)
//  - บังคับอย่างน้อย ชื่อ หรือ เบอร์โทร
//  - สิทธิ์: owner/manager เท่านั้น
//
// CSV parser เองมี unit test แยกที่ qa-tests/unit/card-import-customers-csv-parser.unit.mjs
// (17 cases, plain Node) — ไฟล์นี้ครอบ UI/wiring ผ่าน Playwright mock
const { test, expect } = require("@playwright/test");
const path = require("path");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const CSV_FIXTURE = path.join(__dirname, "_fixtures", "customers-import-sample.csv");

test.describe("Import customers from CSV (/admin/import-customers)", () => {
  test("owner role can access the page", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.goto("/admin/import-customers");
    await expect(page.getByText("📥 นำเข้าข้อมูลลูกค้าเดิม")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/ไม่มีสิทธิ์เข้าหน้านี้/)).toHaveCount(0);
  });

  test("technician role is blocked (owner/manager only)", async ({ page }) => {
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await page.goto("/admin/import-customers");
    await expect(page.getByText(/ไม่มีสิทธิ์เข้าหน้านี้/)).toBeVisible({ timeout: 15000 });
  });

  test("upload -> auto-mapped columns -> preview shows valid/invalid split -> confirm imports, skipping an existing phone", async ({ page }) => {
    const insertCapture = [];
    await installMockAuth(page, {
      role: "owner",
      shopId: SHOP_ID,
      extraRoutes: async (route, url, method) => {
        if (url.includes("/rest/v1/customers")) {
          if (method === "POST") {
            const body = route.request().postDataJSON();
            insertCapture.push(body);
            await route.fulfill({
              status: 201,
              contentType: "application/json",
              body: JSON.stringify(body.map((_, i) => ({ customer_id: 100 + i }))),
            });
            return true;
          }
          // เช็คเบอร์ซ้ำกับที่มีอยู่แล้ว — ให้เบอร์ 0899999999 "มีอยู่แล้ว" ในระบบ
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ phone: "0899999999" }]),
          });
          return true;
        }
        return false;
      },
    });
    await page.goto("/admin/import-customers");
    await expect(page.getByText("📥 นำเข้าข้อมูลลูกค้าเดิม")).toBeVisible({ timeout: 15000 });

    await page.locator('input[type="file"]').setInputFiles(CSV_FIXTURE);

    // auto-mapping เดาถูกจากชื่อคอลัมน์ (name/phone/address ตรงๆ อยู่แล้วในไฟล์ตัวอย่าง)
    await expect(page.getByTestId("mapping-row-name").locator("select")).toHaveValue("name");
    await expect(page.getByTestId("mapping-row-phone").locator("select")).toHaveValue("phone");

    // ไฟล์ตัวอย่างมี 4 แถว: 2 ผ่าน (1 ซ้ำกับ DB เดิม), 1 ไม่มีทั้งชื่อ/เบอร์, 1 เบอร์รูปแบบผิด
    await expect(page.getByTestId("preview-summary")).toContainText("ทั้งหมด 4 แถว");
    await expect(page.getByTestId("preview-summary")).toContainText("มีปัญหา 2 แถว");

    await page.getByRole("button", { name: /ยืนยันนำเข้า/ }).click();

    await expect(page.getByTestId("import-result")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("import-result")).toContainText("นำเข้าสำเร็จ 1 รายชื่อ");
    await expect(page.getByTestId("import-result")).toContainText("ข้าม 2 แถว (ข้อมูลไม่ครบ/ผิดรูปแบบ)");
    await expect(page.getByTestId("import-result")).toContainText("ข้าม 1 แถว (เบอร์โทรซ้ำ");

    expect(insertCapture.length).toBe(1);
    expect(insertCapture[0]).toHaveLength(1);
    expect(insertCapture[0][0]).toMatchObject({ name: "สมชาย ใจดี", phone: "0812345678" });
  });
});
