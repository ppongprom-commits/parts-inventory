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
    // app/login/page.js: loginErrorMessage() แปล Supabase "Invalid login credentials" เป็นข้อความ
    // เจาะจงนี้โดยตรง (ไม่ใช่ fallback "เข้าสู่ระบบไม่สำเร็จ..." ซึ่งใช้เฉพาะ error ที่ไม่รู้จักเท่านั้น)
    await expect(err).toContainText("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  });

  // TC-108
  test("TC-108 validation error เมื่อเว้นว่างอีเมล", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("รหัสผ่าน").fill(accounts.owner.password);
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
    // ช่อง email เป็น required + type=email -> browser-native validation จะ block submit
    // หมายเหตุ: toHaveJSProperty ไม่รองรับ RegExp เป็น expected value จริงๆ (เทียบแบบ strict
    // equality กับ property ธรรมดา) — ของเดิมพัง "เสมอ" ไม่ว่า validationMessage จะเป็นอะไรก็ตาม
    // ไม่ใช่ปัญหา timing/flake อย่างที่ error message ทำให้เข้าใจผิด ต้องอ่านค่าจริงด้วย evaluate()
    // แล้วเทียบเป็น string ปกติแทน
    const emailInput = page.getByLabel("อีเมล");
    const validationMessage = await emailInput.evaluate((el) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });

  // TC-109
  test("TC-109 validation error เมื่อเว้นว่างรหัสผ่าน", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(accounts.owner.email);
    await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
    // เหตุผลเดียวกับ TC-108 — toHaveJSProperty ไม่รองรับ RegExp เป็น expected value
    const pwInput = page.getByLabel("รหัสผ่าน");
    const validationMessage = await pwInput.evaluate((el) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });

  // TC-110
  test("TC-110 SQL injection payload ไม่ bypass login", async ({ page }) => {
    await loginWithEmail(page, `' OR '1'='1`, `' OR '1'='1`);
    // ช่อง email เป็น type="email" (ดู app/login/page.js) — payload นี้ไม่ใช่รูปแบบอีเมลที่ถูกต้อง
    // เลย browser native validation บล็อกการ submit ไปตั้งแต่ต้น ไม่มี network request ไป Supabase
    // เลยด้วยซ้ำ จึงไม่มี .msg.error โผล่มาให้เห็น (คนละเคสกับ TC-101 ที่เป็นอีเมลรูปแบบถูกต้องแต่
    // credential ผิด) — สิ่งที่สำคัญที่สุดของเทสนี้คือต้อง "ไม่ bypass เข้าระบบได้เด็ดขาด" ไม่ใช่ต้องเห็น
    // error message เจาะจง จึงเช็คแค่ว่ายังค้างอยู่หน้า /login เท่านั้น
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login/);
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
