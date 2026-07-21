// Card: "Field Scanner Role + temp account auto-expiry"
//
// ⚠️ Schema drift ที่พบคืนนี้: บทบาท 'field_scanner' มีอยู่แล้วจริงบน staging ทั้งใน
// shop_members_role_check และ RLS ของ parts/zones/customers/part_sales (customers/part_sales
// ตั้งใจไม่รวม field_scanner ไว้ถูกต้องแล้วตามที่การ์ดตัดสินใจ) จากเซสชันก่อนหน้าที่ไม่เคย commit —
// export กลับใน db/field_scanner_role_migration.sql
//
// ของใหม่จริงในรอบนี้: shop_members.expires_at + ต่อสายไฟฝั่ง app (role permission config,
// allowedRoles ของ /add /edit, ซ่อนส่วนขายใน /edit สำหรับ field_scanner, ฟอร์มสร้างบัญชีที่
// /admin/team ตั้งวันหมดอายุได้, เช็ค expires_at ตอน resolve membership ใน AuthProvider)
//
// ❌ ยังไม่ทำ: Onboarding Burst Mode (20 บัญชี, requester/approver, notification) — เป็นการ์ดแยก
// ที่ยังไม่เริ่ม, scheduled job ตัด session ที่ active อยู่ตอนหมดอายุจริง (การ์ดเองยังไม่ตัดสินใจ
// กลไก cron), "job เบื้องต้น" ที่ field scanner สร้างได้ (field scanner ไม่มีสิทธิ์เข้าหน้า jobs เลย
// ในรอบนี้ — ตัดสินใจของเราเอง ไม่ใช่มติจากการ์ด เพราะการ์ดเองก็บอกว่ายัง "ต้อง list ชัด")
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";

test.describe("Field Scanner account creation (/admin/team)", () => {
  test("selecting field_scanner reveals the expiry date field, and it's sent to create-staff", async ({ page }) => {
    const createCapture = [];
    await installMockAuth(page, {
      role: "owner",
      shopId: SHOP_ID,
      extraRoutes: async (route, url) => {
        if (url.includes("/rest/v1/shop_invites")) {
          await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
          return true;
        }
        return false;
      },
    });
    await page.route("**/api/team/list-with-emails", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/team/create-staff", async (route) => {
      const body = route.request().postDataJSON();
      createCapture.push(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { member_id: "new-1" } }) });
    });

    await page.goto("/admin/team");
    await expect(page.getByRole("heading", { name: /จัดการทีม/ })).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId("field-scanner-expiry-field")).toHaveCount(0);
    await page.locator("select").filter({ hasText: "ช่าง" }).first().selectOption("field_scanner");
    await expect(page.getByTestId("field-scanner-expiry-field")).toBeVisible();

    // หมายเหตุ (defect เจอรอบ 1): เดา index ของ input[type="text"] ผิด — ช่อง PIN ก็เป็น
    // type="text" ด้วย (ไม่ใช่ type="password") แทรกอยู่ระหว่าง username กับชื่อ-นามสกุล ทำให้
    // "พนักงานสแกน ทดสอบ" ไปเติมทับ PIN แทนชื่อ-นามสกุล (ที่ต้องกรอกเลยว่างเปล่า -> form validation
    // บล็อกไม่ยิง request) เปลี่ยนมาใช้ placeholder เจาะจงแทน
    await page.getByPlaceholder("เช่น chang01").fill("scanner01");
    await page.locator('input[type="tel"]').fill("080-000-0000");
    // หมายเหตุ (defect เจอรอบ 2): placeholder "เช่น สมชาย ใจดี" ซ้ำกับช่อง "ชื่อผู้ติดต่อ" ของฟอร์ม
    // สร้างบัญชีอีเมล (คนละฟอร์มในหน้าเดียวกัน) — ต้อง scope ด้วย accessible name แทน
    await page.getByRole("textbox", { name: "ชื่อ-นามสกุล" }).fill("พนักงานสแกน ทดสอบ");
    await page.getByTestId("field-scanner-expiry-field").locator('input[type="date"]').fill("2026-08-01");

    await page.getByRole("button", { name: "+ สร้างบัญชีพนักงาน" }).click();

    await expect.poll(() => createCapture.length).toBeGreaterThan(0);
    expect(createCapture[0]).toMatchObject({ role: "field_scanner" });
    expect(createCapture[0].expires_at).toContain("2026-08-01");
  });

  test("member list shows an expiry badge for accounts with expires_at set", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/api/team/list-with-emails", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              member_id: "m-scanner-1",
              role: "field_scanner",
              status: "active",
              login_username: "scanner01",
              contact_name: "พนักงานสแกน ทดสอบ",
              expires_at: "2026-08-01T00:00:00Z",
            },
          ],
        }),
      });
    });
    await page.route("**/rest/v1/shop_invites*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("/admin/team");
    await expect(page.getByText("พนักงานสแกน ทดสอบ")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("expires-at-m-scanner-1")).toContainText("หมดอายุ");
  });
});

test.describe("Field Scanner permissions on /add and /edit/[id]", () => {
  test("field_scanner CAN access /add (not blocked by RequireAuth)", async ({ page }) => {
    await installMockAuth(page, { role: "field_scanner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/shops")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });
    await page.goto("/add");
    await expect(page.getByText("ชื่อชิ้นส่วน *")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/ไม่มีสิทธิ์เข้าหน้านี้/)).toHaveCount(0);
  });

  test("field_scanner does NOT see the sell section on /edit/[id]", async ({ page }) => {
    const PART_ID = "ffffffff-0000-0000-0000-000000000001";
    await installMockAuth(page, { role: "field_scanner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/parts") && url.includes(`id=eq.${PART_ID}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: PART_ID,
            shop_id: SHOP_ID,
            part_name: "กระจกมองข้าง",
            item_type: "salvage",
            quantity: "3",
            zone_id: null,
            zone_code: null,
            photo_urls: [],
            photo_url: null,
          }),
        });
      }
      if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/rpc/get_part_audit_history") || url.includes("/rest/v1/part_sales")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });
    await page.goto(`/edit/${PART_ID}`);

    await expect(page.getByText("✏️ แก้ไขอะไหล่")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("💰 ขายอะไหล่ชิ้นนี้")).toHaveCount(0);
  });
});

test.describe("Expired temporary account is blocked at login", () => {
  test("shows the expired-account screen instead of app content", async ({ page }) => {
    await installMockAuth(page, {
      role: "field_scanner",
      shopId: SHOP_ID,
      memberships: [
        {
          member_id: "22222222-2222-2222-2222-222222222222",
          shop_id: SHOP_ID,
          role: "field_scanner",
          status: "active",
          login_username: "scanner01",
          contact_name: "QA Field Scanner",
          expires_at: "2020-01-01T00:00:00Z", // ผ่านมานานแล้ว
          shops: { shop_name: "QA Test Shop", subscription_status: "active", subscription_plan: "pro" },
        },
      ],
    });
    await page.goto("/add");

    await expect(page.getByTestId("expired-account-screen")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("บัญชีชั่วคราวนี้หมดอายุแล้ว")).toBeVisible();
  });

  test("a not-yet-expired field_scanner account works normally", async ({ page }) => {
    await installMockAuth(page, {
      role: "field_scanner",
      shopId: SHOP_ID,
      memberships: [
        {
          member_id: "22222222-2222-2222-2222-222222222222",
          shop_id: SHOP_ID,
          role: "field_scanner",
          status: "active",
          login_username: "scanner01",
          contact_name: "QA Field Scanner",
          expires_at: "2099-01-01T00:00:00Z", // ยังไม่ถึงกำหนด
          shops: { shop_name: "QA Test Shop", subscription_status: "active", subscription_plan: "pro" },
        },
      ],
    });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/shops")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });
    await page.goto("/add");

    await expect(page.getByTestId("expired-account-screen")).toHaveCount(0);
    await expect(page.getByText("ชื่อชิ้นส่วน *")).toBeVisible({ timeout: 15000 });
  });
});
