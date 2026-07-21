// Card: "Reset password ให้คนในอู่ — ครอบคลุมบัญชีอีเมล + เพิ่มปุ่ม UI (เจ้าของ/ผู้จัดการทำได้)"
//
// สถานะก่อนเริ่มงานคืนนี้ (verify จาก DB+โค้ดจริงใน commit df9b091 ที่มีอยู่แล้วในบอร์ด staging):
//  1. ปุ่ม "รีเซ็ต PIN/รหัสผ่าน" ใน /admin/team — มีอยู่แล้ว ใช้ได้ทั้งบัญชี username+PIN และอีเมล
//  2. /api/team/reset-pin — ใช้ supabaseAdmin.auth.admin.updateUserById ตั้งรหัสใหม่ได้ทั้ง 2 ชนิดบัญชี
//     (ไม่มี logic reject บัญชีอีเมลเหมือนที่การ์ดบันทึกไว้ตอนแรกแล้ว — ถูกแก้ไปแล้วในคอมมิตก่อนหน้า)
// งานที่ทำเพิ่มคืนนี้ (ส่วนที่ยังขาดจริงตามขอบเขตการ์ด):
//  4. เพิ่ม "ลืมรหัสผ่าน" ที่ /login (resetPasswordForEmail) + หน้า /reset-password รับลิงก์
//     แทนการพึ่ง scripts/reset-owner-password.mjs รันมือถาวร
//
// NOTE ด้าน environment: sandbox นี้เข้าถึง *.supabase.co ตรงๆ ไม่ได้ (เหมือน qa-tests อื่นในโปรเจกต์
// นี้) mock เครือข่าย Supabase auth ทั้งหมดผ่าน page.route — ทดสอบ client-side logic + wiring
// (ปุ่ม/ฟอร์ม/การเรียก API ถูกต้อง) ส่วน permission logic ฝั่ง server (verifyShopManager,
// self-service check, กัน owner ถูกรีเซ็ตแทน) verify ด้วยการอ่านโค้ดจริงแล้ว (lib/teamAuth.js,
// app/api/team/reset-pin/route.js) — full live E2E ต้องรันที่มี network ถึง Supabase จริง
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

test.describe("Reset password / PIN — UI + forgot-password flow", () => {
  test("/admin/team shows a reset button for an email-account member and it succeeds", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await installMockAuth(page, {
      role: "owner",
      memberships: [
        {
          member_id: "22222222-2222-2222-2222-222222222222",
          shop_id: "11111111-1111-1111-1111-111111111111",
          role: "owner",
          status: "active",
          login_username: null,
          contact_name: "QA Owner",
          shops: { shop_name: "QA Test Shop", subscription_status: "active", subscription_plan: "pro" },
        },
      ],
      extraRoutes: async (route, url) => {
        if (url.includes("/rest/v1/shop_invites")) {
          await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
          return true;
        }
        return false;
      },
    });

    // /api/team/* เป็น same-origin route ไม่ใช่ *.supabase.co — ต้อง mock แยกต่างหาก
    // (extraRoutes ของ installMockAuth ผูกกับ page.route("**/*.supabase.co/**") เท่านั้น)
    await page.route("**/api/team/list-with-emails", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              member_id: "m-email-1",
              role: "manager",
              status: "active",
              login_username: null,
              email: "manager-email@testshop.com",
              contact_name: "ผู้จัดการทดสอบ",
            },
          ],
        }),
      });
    });
    await page.route("**/api/team/reset-pin", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
    });

    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/admin/team");
    await expect(page.getByRole("heading", { name: /จัดการทีม/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("ผู้จัดการทดสอบ")).toBeVisible({ timeout: 10000 });

    // สมาชิกนี้เป็นบัญชีอีเมล (login_username: null) → ปุ่มต้องขึ้น "รีเซ็ตรหัสผ่าน" (ไม่ใช่ PIN)
    const resetBtn = page.getByRole("button", { name: /รีเซ็ตรหัสผ่าน/ });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    await expect(page.getByText(/รีเซ็ตรหัสผ่านของ.*สำเร็จ/)).toBeVisible({ timeout: 10000 });

    expect(pageErrors, `Unexpected client-side JS errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test("/login: forgot-password form sends resetPasswordForEmail and shows success", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    let recoverCalled = false;
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/v1/recover")) {
        recoverCalled = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      // ไม่ได้ login อยู่แล้ว (ทดสอบหน้า /login ตรงๆ) → getSession/user คืนค่าว่าง
      if (url.includes("/auth/v1/user") || url.includes("/auth/v1/token")) {
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "no session" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /เข้าสู่ระบบ/ })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "ลืมรหัสผ่าน?" }).click();
    // ใช้ #forgot_email เจาะจง เพราะหน้านี้มี input[type=email] 2 ช่อง (ฟอร์ม login หลัก + ฟอร์มลืมรหัสผ่าน)
    await page.fill('#forgot_email', "owner@testshop.com");
    await page.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" }).click();

    await expect(page.getByText(/ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว/)).toBeVisible({ timeout: 10000 });
    expect(recoverCalled).toBe(true);

    expect(pageErrors, `Unexpected client-side JS errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test("/reset-password: valid recovery session lets user set a new password", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    let updateUserCalled = false;
    await installMockAuth(page, {});

    // installMockAuth ผูก page.route("**/*.supabase.co/**") ไว้ก่อนแล้ว และมัน fulfill
    // "/auth/v1/user" แบบไม่แยก method (คิดว่าเป็น GET เสมอ) — ต้อง route ทับอีกชั้นเพื่อจับ
    // PUT /auth/v1/user (updateUser) โดยเฉพาะ ส่วน request อื่นปล่อยให้ route เดิมจัดการต่อ
    // (Playwright: handler ที่ register หลังสุดทำงานก่อน, route.fallback() ส่งต่อให้ handler ก่อนหน้า)
    await page.route("**/*.supabase.co/**", async (route) => {
      const req = route.request();
      if (req.url().includes("/auth/v1/user") && req.method() === "PUT") {
        updateUserCalled = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "x" } }) });
      }
      return route.fallback();
    });

    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่/ })).toBeVisible({ timeout: 15000 });

    await page.fill('input[autocomplete="new-password"] >> nth=0', "newSecurePass123");
    await page.fill('input[autocomplete="new-password"] >> nth=1', "newSecurePass123");
    await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();

    await expect(page.getByText(/ตั้งรหัสผ่านใหม่สำเร็จแล้ว/)).toBeVisible({ timeout: 10000 });
    expect(updateUserCalled).toBe(true);

    expect(pageErrors, `Unexpected client-side JS errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test("/reset-password: rejects mismatched passwords client-side", async ({ page }) => {
    await installMockAuth(page, {});
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่/ })).toBeVisible({ timeout: 15000 });

    await page.fill('input[autocomplete="new-password"] >> nth=0', "passwordOne");
    await page.fill('input[autocomplete="new-password"] >> nth=1', "passwordTwo");
    await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();

    await expect(page.getByText(/ไม่ตรงกัน/)).toBeVisible({ timeout: 10000 });
  });
});
