import { test, expect } from "@playwright/test";
import {
  loginWithEmail,
  loginWithStaffPin,
  expectLoginSucceeded,
  expectRoleForbidden,
} from "../fixtures/auth-helpers.js";
import { accounts, pageAccess } from "../fixtures/test-data.js";

test.describe("RBAC — Admin-only pages (allowedRoles: owner, manager)", () => {
  // TC-201
  test("TC-201 supervisor เข้า /admin/options ตรงๆ ต้องเจอ role-forbidden", async ({ page }) => {
    await loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin);
    await expectLoginSucceeded(page);
    await page.goto("/admin/options");
    await expectRoleForbidden(page, "supervisor");
  });

  // TC-202 — วนทุกหน้า admin-only ด้วย technician
  for (const path of pageAccess.adminOnly) {
    test(`TC-202 technician เข้า ${path} ต้องเจอ role-forbidden`, async ({ page }) => {
      await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
      await expectLoginSucceeded(page);
      await page.goto(path);
      await expectRoleForbidden(page, "technician");
    });
  }

  // sanity check: owner/manager ต้องเข้าได้ปกติ (ไม่ error) — กันไม่ให้ TC-201/202 pass เพราะหน้าพังทั้งหน้า
  test("Sanity: owner เข้า /admin/options ได้ปกติ ไม่เจอ role-forbidden", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/options");
    await expect(page.locator(".msg.error", { hasText: "ไม่มีสิทธิ์เข้าหน้านี้" })).toHaveCount(0);
  });
});

test.describe("RBAC — Shared operational pages (allowedRoles: ทุก shop role)", () => {
  // TC-203
  for (const path of pageAccess.allShopRoles) {
    test(`TC-203 assistant เข้า ${path} ได้ปกติ`, async ({ page }) => {
      await loginWithStaffPin(page, accounts.assistant.username, accounts.assistant.pin);
      await expectLoginSucceeded(page);
      await page.goto(path);
      await expect(page.locator(".msg.error", { hasText: "ไม่มีสิทธิ์เข้าหน้านี้" })).toHaveCount(0);
    });
  }
});

test.describe("RBAC — Platform admin isolation (platform_admins table, ไม่ใช่ shop role)", () => {
  // TC-204
  test("TC-204 owner ธรรมดา (ไม่มีแถวใน platform_admins) เข้า /platform-admin ต้องถูก 403", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/platform-admin");
    await expect(
      page.locator(".msg.error", { hasText: "ไม่มีสิทธิ์เข้าหน้า Platform Admin" })
    ).toBeVisible({ timeout: 8000 });
  });

  // TC-006
  test("TC-006 owner ที่มีแถวใน platform_admins เข้า /platform-admin ได้สำเร็จ", async ({ page }) => {
    await loginWithEmail(
      page,
      accounts.ownerPlatformAdmin.email,
      accounts.ownerPlatformAdmin.password
    );
    await expectLoginSucceeded(page);
    await page.goto("/platform-admin");
    await expect(page.getByRole("heading", { name: /Platform Admin/ })).toBeVisible({
      timeout: 8000,
    });
    await expect(
      page.locator(".msg.error", { hasText: "ไม่มีสิทธิ์เข้าหน้า Platform Admin" })
    ).toHaveCount(0);
  });
});
