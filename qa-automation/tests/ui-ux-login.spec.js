import { test, expect } from "@playwright/test";
import { accounts } from "../fixtures/test-data.js";

// ------------------------------------------------------------
// TC-501–504 จาก test_cases_login_rbac_parts_inventory.xlsx เขียนไว้ก่อนที่จะเปิดโค้ดจริงดู
// ตอนนี้ตรวจสอบ app/login/page.js และ app/staff-login/page.js แล้วพบว่า 2 ข้อ (TC-501, TC-504)
// ไม่ตรงกับสิ่งที่มีอยู่จริง — เขียน test ให้สะท้อนความจริง พร้อม comment อธิบายไว้ชัดเจน
// แทนที่จะปรับ assertion ให้ผ่านหลอกๆ
// ------------------------------------------------------------

test.describe("UI/UX — /login และ /staff-login", () => {
  // TC-501: ตรวจสอบจากโค้ดแล้วพบว่า "ปุ่มตา" แสดง/ซ่อนรหัสผ่านไม่มีอยู่จริงในทั้ง 2 หน้า
  // (input เป็น type="password" เปล่าๆ ไม่มี toggle button ใดๆ) — ทำเป็น skip พร้อมเหตุผล
  // แทนที่จะลบทิ้งเงียบๆ เพื่อให้เห็นว่า test case นี้ "ยังไม่มี feature ให้เทสต์" ไม่ใช่ "ลืมทำ"
  test.skip(
    "TC-501 แสดง/ซ่อนรหัสผ่าน (ปุ่มตา) — ฟีเจอร์นี้ยังไม่มีในแอปจริง (ตรวจจาก app/login/page.js, app/staff-login/page.js แล้ว)",
    async () => {}
  );

  // TC-502
  test("TC-502a ปุ่ม Login ที่ /login disable ระหว่างรอ response (กัน double submit)", async ({
    page,
  }) => {
    // หน่วง response ของ signInWithPassword ให้พอจะเห็น disabled state ทัน
    await page.route("**/auth/v1/token*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(accounts.owner.email);
    await page.getByLabel("รหัสผ่าน").fill(accounts.owner.password);

    const button = page.getByRole("button", { name: /เข้าสู่ระบบ/ });
    await button.click();

    await expect(button).toBeDisabled();
    await expect(button).toHaveText("กำลังเข้าสู่ระบบ...");
  });

  test("TC-502b ปุ่ม Login ที่ /staff-login disable ระหว่างรอ response", async ({ page }) => {
    await page.route("**/auth/v1/token*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto("/staff-login");
    await page.getByLabel("Username").fill(accounts.technician.username);
    await page.getByLabel(/PIN/).fill(accounts.technician.pin);

    const button = page.getByRole("button", { name: /เข้าสู่ระบบ/ });
    await button.click();

    await expect(button).toBeDisabled();
    await expect(button).toHaveText("กำลังเข้าสู่ระบบ...");
  });

  // TC-503
  test.describe("TC-503 Responsive", () => {
    const viewports = [
      { name: "mobile", width: 375, height: 812 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      for (const path of ["/login", "/staff-login"]) {
        test(`${path} แสดงผลได้ปกติที่ขนาดจอ ${vp.name} (${vp.width}x${vp.height})`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(path);

          // ฟอร์มต้องอยู่ใน viewport ไม่ล้นจอ (ไม่มี horizontal scroll)
          const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(bodyScrollWidth).toBeLessThanOrEqual(vp.width + 1); // +1 กัน rounding

          await expect(page.getByRole("button", { name: /เข้าสู่ระบบ/ })).toBeVisible();
        });
      }
    }
  });

  // TC-504
  test("TC-504a /staff-login แสดง error เป็นภาษาไทยล้วน ไม่มีข้อความ default ของ Supabase หลุดมา", async ({
    page,
  }) => {
    await page.goto("/staff-login");
    await page.getByLabel("Username").fill(accounts.technician.username);
    await page.getByLabel(/PIN/).fill("wrong-pin-000");
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();

    const err = page.locator(".msg.error");
    await expect(err).toBeVisible({ timeout: 8000 });
    const text = await err.textContent();
    // ข้อความใน app/staff-login/page.js เป็น hardcoded ภาษาไทยล้วน ไม่ต่อ error.message เลย
    expect(text).not.toMatch(/[A-Za-z]{4,}/); // ไม่ควรมีคำภาษาอังกฤษยาวๆ ปนอยู่
  });

  // ⚠️ พบว่า /login (ต่างจาก /staff-login) เขียนโค้ดต่อ error.message ของ Supabase เข้าไปตรงๆ:
  //   setMsg({ type: "error", text: "เข้าสู่ระบบไม่สำเร็จ: " + error.message })
  // ซึ่ง error.message จาก Supabase มักเป็นภาษาอังกฤษ (เช่น "Invalid login credentials")
  // ดังนั้น test นี้ "คาดหวังว่าจะไม่มีอังกฤษหลุด" แต่โค้ดจริงหลุดแน่นอน — ตั้งใจปล่อยให้ FAIL
  // เพื่อ flag เป็นบั๊ก/ของที่ควรปรับ UX ให้ทีม dev เห็นชัดเจน แทนที่จะลบ assertion ทิ้ง
  test("TC-504b /login ไม่ควรมีข้อความ error ภาษาอังกฤษของ Supabase หลุดออกมา (คาดว่าจะ FAIL ในโค้ดปัจจุบัน)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(accounts.owner.email);
    await page.getByLabel("รหัสผ่าน").fill("wrong-password-000");
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();

    const err = page.locator(".msg.error");
    await expect(err).toBeVisible({ timeout: 8000 });
    const text = await err.textContent();

    // ตั้งใจ assert สิ่งที่ "ควรจะเป็น" ไม่ใช่สิ่งที่โค้ดปัจจุบันทำ:
    // ถ้า test นี้ fail แปลว่ายืนยันบั๊กที่เจอจริง (error.message ของ Supabase หลุดมาเป็นอังกฤษ)
    // แนะนำให้ทีม dev แก้ app/login/page.js ให้ map error.message เป็นข้อความไทย
    // แทนการต่อ string ตรงๆ แล้วค่อยลบ .skip / แก้ assertion นี้ให้ strict เหมือน TC-504a
    expect(text).not.toMatch(/[A-Za-z]{4,}/);
  });
});
