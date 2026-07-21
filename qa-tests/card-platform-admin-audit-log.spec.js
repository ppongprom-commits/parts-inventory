// Card: "Platform admin audit log — บันทึกทุกการกระทำที่กระทบลูกค้า" (Priority: Highest)
//
// This test covers the client-side UI piece only (Activity Log tab: renders the
// timeline, filters client-side, paginates via "load more"). The route it calls
// (/api/platform/audit-log) is mocked at the Playwright network layer since the
// underlying supabaseAdmin calls need real Supabase network access this sandbox
// doesn't have (confirmed via curl -> 403 to *.supabase.co — same constraint noted
// in qa-tests/_fixtures/mockAuth.js and qa-tests/unit/card-platform-role-tiers.unit.mjs).
//
// The transactional "block main action if audit log write fails" invariant and the
// append-only guarantee were verified directly against a local Postgres instance
// running the real migration SQL (see final report — not expressible as a Playwright
// browser test since there's no UI path that can simulate a server-side DB failure).
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const PAGE1 = [
  {
    audit_id: 3,
    admin_user_id: "a1111111-1111-1111-1111-111111111111",
    admin_role: "super_admin",
    admin_email: "super@testshop.com",
    action: "update_shop_subscription",
    status: "success",
    target_shop_id: 1,
    target_shop_name: "QA Test Shop",
    created_at: "2026-07-20T10:00:00Z",
  },
  {
    audit_id: 2,
    admin_user_id: "a2222222-2222-2222-2222-222222222222",
    admin_role: "support",
    admin_email: "support@testshop.com",
    action: "join_as_support",
    status: "success",
    target_shop_id: 2,
    target_shop_name: "Other Shop",
    created_at: "2026-07-20T09:00:00Z",
  },
];

test.describe("Platform admin Activity Log tab", () => {
  test("shows a timeline of platform admin actions and supports client-side filtering", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await installMockAuth(page, { role: "owner" });

    // /api/platform/* คือ same-origin route ไม่ใช่ *.supabase.co — ต้อง mock แยกต่างหาก
    // (extraRoutes ของ installMockAuth ผูกกับ page.route("**/*.supabase.co/**") เท่านั้น)
    await page.route("**/api/platform/shops", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/platform/audit-log**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: PAGE1, total: 2 }),
      });
    });

    await page.goto("/platform-admin");
    await expect(page.getByRole("heading", { name: /Platform Admin/ })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Activity Log/ }).click();

    await expect(page.getByText("แก้ subscription/billing")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Join-as-support")).toBeVisible();
    await expect(page.getByText(/super@testshop\.com/)).toBeVisible();
    await expect(page.getByText(/QA Test Shop/)).toBeVisible();

    // client-side filter by shop name
    await page.fill('input[placeholder*="กรองตามคน"]', "Other Shop");
    await expect(page.getByText("Join-as-support")).toBeVisible();
    await expect(page.getByText("แก้ subscription/billing")).toHaveCount(0);

    expect(pageErrors, `Unexpected client-side JS errors: ${pageErrors.join("; ")}`).toEqual([]);
  });
});
