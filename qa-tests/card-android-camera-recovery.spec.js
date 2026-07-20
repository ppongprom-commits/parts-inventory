// Card: "ถ่ายรูปตอนเพิ่มอะไหล่ (/add) บน Android Chrome → หน้า reset ทั้งหมด"
// (Android ฆ่า tab ระหว่างเปิดกล้อง)
//
// Root cause (จากการ์ด): Android ฆ่า background tab process ตอนเปิดแอปกล้อง native
// (input capture="environment") เพื่อคืนหน่วยความจำ → Chrome ต้อง reload หน้าใหม่ทั้งหมด
// → React state (form + photos) หายหมด
//
// Mitigation ที่ตัดสินใจแล้ว (19 ก.ค. 2026): แปลงรูปเป็น base64 เก็บคู่กับฟอร์มใน
// sessionStorage ทุกครั้งที่เพิ่ม/ลบรูป — ตอน mount เช็คว่ามีข้อมูลค้างไหม ถ้ามีให้กู้คืน
// + แจ้งเตือนผู้ใช้ — ล้างทันทีที่บันทึกสำเร็จ หรือกด "← กลับ" ออกจากหน้าแบบตั้งใจ
//
// วิธี "simulate tab kill": Android ฆ่า process แล้ว Chrome reload หน้าใหม่ทั้งหมด — จำลอง
// ด้วย page.reload() ตรงๆ ได้เลย เพราะผลลัพธ์ต่อ React state เหมือนกันทุกประการ (state หายหมด
// sessionStorage รอดเพราะเป็น per-origin storage ไม่ผูกกับ process/tab lifetime)
const path = require("path");
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const TEST_PHOTO = path.join(__dirname, "_fixtures", "test-photo.jpg");

async function mockZonesAndOptions(route, url) {
  if (url.includes("/rest/v1/zones")) {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return true;
  }
  if (url.includes("/rest/v1/options")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { category: "condition", value: "สภาพดี", sort_order: 1 },
        { category: "source_type", value: "ถอดจากรถชน", sort_order: 1 },
      ]),
    });
    return true;
  }
  return false;
}

test.describe("Android Chrome camera tab-kill recovery (/add)", () => {
  test("form + photo survive a full page reload (simulated Android tab kill)", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await installMockAuth(page, {
      role: "technician",
      extraRoutes: mockZonesAndOptions,
    });

    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /เพิ่มอะไหล่/ })).toBeVisible({ timeout: 15000 });

    // กรอกข้อมูลบางส่วนก่อน (จำลองผู้ใช้พิมพ์ชื่ออะไหล่ไว้ก่อนถ่ายรูป)
    await page.fill('input[name="part_name"]', "ประตูหน้าขวา QA-RECOVERY");
    await page.fill('input[name="part_number"]', "TEST-PART-9001");

    // กด "ถ่ายรูป" จริงในเบราว์เซอร์ headless เปิดกล้องไม่ได้ — แต่ input ที่มี capture="environment"
    // ก็คือ <input type=file> ธรรมดาที่รับไฟล์ผ่าน onChange เหมือนกันทุกประการ ทดสอบตรงนี้แทนได้จริง
    // (ต่างกันแค่ตอน "เรียก" ไฟล์มา ซึ่งเป็นเรื่องของ OS/เบราว์เซอร์ ไม่ใช่โค้ดของเรา)
    const cameraInput = page.locator('input[type="file"][capture="environment"]');
    await cameraInput.setInputFiles(TEST_PHOTO);

    // รอให้ resize + เขียน sessionStorage เสร็จ (มี preview thumbnail โผล่ = photos state อัปเดตแล้ว)
    await expect(page.locator(".photo-thumb")).toHaveCount(1, { timeout: 10000 });

    // ยืนยันว่า sessionStorage มีข้อมูลกู้คืนจริง ก่อนจะ reload
    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem("add_part_form_recovery_v1") !== null), {
        timeout: 5000,
      })
      .toBe(true);

    // === จำลอง Android ฆ่า tab process ระหว่างเปิดกล้อง: full reload ===
    await page.reload();
    await expect(page.getByRole("heading", { name: /เพิ่มอะไหล่/ })).toBeVisible({ timeout: 15000 });

    // ต้องเห็นข้อความแจ้งกู้คืนข้อมูล
    await expect(page.getByText(/กู้คืนข้อมูลที่ค้างไว้แล้ว/)).toBeVisible({ timeout: 10000 });

    // ฟอร์มที่กรอกไว้ต้องกลับมาครบ
    await expect(page.locator('input[name="part_name"]')).toHaveValue("ประตูหน้าขวา QA-RECOVERY");
    await expect(page.locator('input[name="part_number"]')).toHaveValue("TEST-PART-9001");

    // รูปที่เพิ่งถ่ายต้องกลับมาด้วย (ไม่ใช่แค่ฟอร์ม)
    await expect(page.locator(".photo-thumb")).toHaveCount(1, { timeout: 10000 });

    expect(pageErrors, `Unexpected client-side JS errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test('sessionStorage recovery data is cleared when user intentionally leaves via "← กลับ"', async ({ page }) => {
    await installMockAuth(page, {
      role: "technician",
      extraRoutes: mockZonesAndOptions,
    });

    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /เพิ่มอะไหล่/ })).toBeVisible({ timeout: 15000 });

    await page.fill('input[name="part_name"]', "ของทดสอบยกเลิก");
    const cameraInput = page.locator('input[type="file"][capture="environment"]');
    await cameraInput.setInputFiles(TEST_PHOTO);
    await expect(page.locator(".photo-thumb")).toHaveCount(1, { timeout: 10000 });

    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem("add_part_form_recovery_v1") !== null))
      .toBe(true);

    await page.getByRole("link", { name: /กลับ/ }).click();

    // ต้องเคลียร์ sessionStorage ทันทีที่ตั้งใจออกจากหน้า ไม่ปล่อยข้อมูลค้างข้ามรอบการใช้งาน
    const stillThere = await page.evaluate(() => sessionStorage.getItem("add_part_form_recovery_v1") !== null);
    expect(stillThere).toBe(false);
  });

  test("recovery data is cleared after a successful save", async ({ page }) => {
    await installMockAuth(page, {
      role: "technician",
      extraRoutes: async (route, url, method) => {
        const handled = await mockZonesAndOptions(route, url);
        if (handled) return true;
        if (url.includes("/storage/v1/object/part-photos/")) {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "part-photos/fake.jpg" }) });
          return true;
        }
        if (url.includes("/rest/v1/parts") && method === "POST") {
          await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ part_id: 999 }]) });
          return true;
        }
        return false;
      },
    });

    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /เพิ่มอะไหล่/ })).toBeVisible({ timeout: 15000 });

    await page.fill('input[name="part_name"]', "ของทดสอบบันทึกสำเร็จ");
    const cameraInput = page.locator('input[type="file"][capture="environment"]');
    await cameraInput.setInputFiles(TEST_PHOTO);
    await expect(page.locator(".photo-thumb")).toHaveCount(1, { timeout: 10000 });

    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem("add_part_form_recovery_v1") !== null))
      .toBe(true);

    await page.click('button[type="submit"]');
    await expect(page.getByText(/บันทึกอะไหล่เรียบร้อยแล้ว/)).toBeVisible({ timeout: 10000 });

    const stillThere = await page.evaluate(() => sessionStorage.getItem("add_part_form_recovery_v1") !== null);
    expect(stillThere).toBe(false);
  });
});
