// Card: "Stock Value Cap Engine" (Priority: High, L — "ทำก่อนสุด เพราะ pricing table ทั้งหมดพึ่งพา
// ตัวนี้")
//
// Scope this run — see db/stock_value_cap_engine_migration.sql header for the full breakdown of
// what's implemented (running counter + trigger-maintained state machine, fully in the DB) vs.
// deliberately deferred (salvage-vehicle cost blending pending the "Salvage cost allocation" card,
// email notifications — no email infra, nightly cron reconciliation — no cron mechanism decided).
//
// The counter/state-machine trigger logic itself was verified directly against staging via
// Supabase MCP SQL (crossing the cap -> grace; dropping back under during grace -> resets to
// under immediately) — not re-tested here since it's DB-only, no UI surface. These tests cover
// the UI-visible pieces: the banner and the job-creation block.
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";

function membershipRow(stockCapStatus) {
  return [
    {
      member_id: "22222222-2222-2222-2222-222222222222",
      shop_id: SHOP_ID,
      role: "owner",
      status: "active",
      login_username: null,
      contact_name: "QA Owner",
      shops: {
        shop_name: "QA Test Shop",
        subscription_status: "active",
        subscription_plan: "starter",
        current_stock_value: 1500000,
        stock_cap_status: stockCapStatus,
      },
    },
  ];
}

async function mockPartsAndZones(page) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/parts") || url.includes("/rest/v1/zones") || url.includes("/rest/v1/options")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("Stock Value Cap Engine — banner on grace/blocked", () => {
  test("shows the grace-period warning banner when stock_cap_status = grace", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID, memberships: membershipRow("grace") });
    await mockPartsAndZones(page);

    await page.goto("/");
    await expect(page.getByTestId("stock-cap-banner-grace")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/มีเวลา 7 วัน/)).toBeVisible();
    await expect(page.getByTestId("stock-cap-banner-blocked")).toHaveCount(0);
  });

  test("shows the blocked banner when stock_cap_status = blocked", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID, memberships: membershipRow("blocked") });
    await mockPartsAndZones(page);

    await page.goto("/");
    await expect(page.getByTestId("stock-cap-banner-blocked")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/การขาย\/\s*ลดสต็อกยังทำได้ตามปกติ/)).toBeVisible();
  });

  test("no banner at all when stock_cap_status = under (normal case)", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID, memberships: membershipRow("under") });
    await mockPartsAndZones(page);

    await page.goto("/");
    await expect(page.getByText("บทบาทของคุณ: owner")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("stock-cap-banner-grace")).toHaveCount(0);
    await expect(page.getByTestId("stock-cap-banner-blocked")).toHaveCount(0);
  });
});

test.describe("Stock Value Cap Engine — blocks creating a new job when blocked", () => {
  test("blocked: submitting the new-job form shows the block message and does not insert a job", async ({
    page,
  }) => {
    const jobInsertCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID, memberships: membershipRow("blocked") });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/rest/v1/jobs") && method === "POST") {
        jobInsertCapture.push(true);
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      if (url.includes("/rest/v1/customers") || url.includes("/rest/v1/model_generations")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });

    await page.goto("/jobs/new");
    await expect(page.getByRole("button", { name: "รับงานเข้าอู่" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "รับงานเข้าอู่" }).click();

    // ใช้ข้อความเฉพาะของ error message ที่หน้าฟอร์มเอง (ต่างจากข้อความ banner ที่ก็มีคำว่า
    // "สร้างงานใหม่ถูกระงับชั่วคราว" ซ้ำกันอยู่ — เจอ strict-mode violation รอบแรกที่เขียนเทสนี้)
    await expect(page.getByText(/เพราะมูลค่าสต็อกเกินขีดจำกัดของแพ็กเกจเกิน 7 วันแล้ว/)).toBeVisible();
    expect(jobInsertCapture.length).toBe(0);
  });

  test("grace (not yet blocked): the new-job form is NOT blocked — only 'blocked' status blocks it", async ({
    page,
  }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID, memberships: membershipRow("grace") });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/jobs") || url.includes("/rest/v1/customers") || url.includes("/rest/v1/model_generations")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });

    await page.goto("/jobs/new");
    await expect(page.getByRole("button", { name: "รับงานเข้าอู่" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "รับงานเข้าอู่" }).click();

    // ไม่ควรเห็นข้อความบล็อก (grace ยังไม่บล็อก ตามการ์ด)
    await expect(page.getByText(/สร้างงานใหม่ถูกระงับชั่วคราว/)).toHaveCount(0);
  });
});
