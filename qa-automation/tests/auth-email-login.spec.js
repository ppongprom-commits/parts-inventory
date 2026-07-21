import { test, expect } from "@playwright/test";
import {
  loginWithEmail,
  expectLoginSucceeded,
  expectLoginFailed,
} from "../fixtures/auth-helpers.js";
import { accounts } from "../fixtures/test-data.js";

test.describe("Email + Password Login (/login) — owner / manager", () => {
  // TC-001
  test("TC-001 login สำเร็จด้วย owner", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
  });

  // TC-002
  test("TC-002 login สำเร็จด้วย manager", async ({ page }) => {
    await loginWithEmail(page, accounts.manager.email, accounts.manager.password);
    await expectLoginSucceeded(page);
  });

  // TC-101
  test("TC-101 login ล้มเหลวเมื่อ password ผิด", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, "WrongPass1!");
    const err = await expectLoginFailed(page, { onPath: "/login" });
    await expect(err).toContainText("เข้าสู่ระบบไม่สำเร็จ");
  });

  // TC-108
  test("TC-108 validation error เมื่อเว้นว่างอีเมล", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("รหัสผ่าน").fill(accounts.owner.password);
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
    // ช่อง email เป็น required + type=email -> browser-native validation จะ block submit
    const emailInput = page.getByLabel("อีเมล");
    await expect(emailInput).toHaveJSProperty("validationMessage", /.+/);
    await expect(page).toHaveURL(/\/login/);
  });

  // TC-109
  test("TC-109 validation error เมื่อเว้นว่างรหัสผ่าน", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(accounts.owner.email);
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
    const pwInput = page.getByLabel("รหัสผ่าน");
    await expect(pwInput).toHaveJSProperty("validationMessage", /.+/);
    await expect(page).toHaveURL(/\/login/);
  });

  // TC-110
  test("TC-110 SQL injection payload ไม่ bypass login", async ({ page }) => {
    await loginWithEmail(page, `' OR '1'='1`, `' OR '1'='1`);
    await expectLoginFailed(page, { onPath: "/login" });
  });

  // TC-111
  test("TC-111 XSS payload ในช่อง email ไม่ execute script", async ({ page }) => {
    let dialogFired = false;
    page.once("dialog", async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });
    await loginWithEmail(page, `<script>alert(1)</script>`, "whatever");
    await page.waitForTimeout(1000);
    expect(dialogFired).toBe(false);
  });
});
