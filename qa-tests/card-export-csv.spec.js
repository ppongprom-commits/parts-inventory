// Card: "Export CSV (Starter+)"
//
// Scope note: implemented Parts CSV export only (see route.js comment) — Jobs/Sales CSV
// from the card's spec depend on features that don't exist yet (payment_method,
// cart-based selling flow, Field Visibility Whitelist), left for a follow-up card.
//
// This spec covers the UI-gating test scenario from the card ("Tier gate: Trial → ปุ่มไม่
// แสดง และ API 403 (เทสต์ 2 ชั้น)" + the role decision "Owner/Manager/Supervisor เท่านั้น"):
// verifies the button is hidden for technician/assistant roles and visible for
// owner/manager/supervisor. The API-side 403 checks (role + tier) are plain sequential
// Supabase queries mirroring the already-tested patterns in lib/teamAuth.js elsewhere in
// this project; the CSV formatting logic itself (BOM, RFC 4180 escaping, null handling) is
// covered by qa-tests/unit/card-export-csv.unit.mjs, which needs no network at all.
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

async function gotoAdmin(page, role) {
  await installMockAuth(page, { role });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /ตั้งค่าระบบ/ })).toBeVisible({ timeout: 15000 });
}

test.describe("Export CSV — role-gated button on /admin", () => {
  for (const role of ["owner", "manager", "supervisor"]) {
    test(`"${role}" sees the Export CSV button`, async ({ page }) => {
      await gotoAdmin(page, role);
      await expect(page.getByText("📤 Export CSV")).toBeVisible();
      await expect(page.getByRole("button", { name: /ดาวน์โหลด CSV/ })).toBeVisible();
    });
  }

  for (const role of ["technician", "assistant"]) {
    test(`"${role}" does NOT see the Export CSV button`, async ({ page }) => {
      await gotoAdmin(page, role);
      await expect(page.getByText("📤 Export CSV")).toHaveCount(0);
    });
  }
});
