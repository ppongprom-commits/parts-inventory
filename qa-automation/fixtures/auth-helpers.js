// ------------------------------------------------------------
// Helper ที่อ้างอิง selector จริงจาก source code (branch: staging)
//   app/login/page.js        -> label "อีเมล" / "รหัสผ่าน", ปุ่ม "เข้าสู่ระบบ"
//   app/staff-login/page.js  -> label "Username" / "PIN / รหัสผ่าน", ปุ่ม "เข้าสู่ระบบ"
//   components/RequireAuth.js -> ข้อความ error ตาม role, หน้า disabled account
// ถ้า markup ในโค้ดเปลี่ยนไปจากตอนที่ตรวจสอบ ให้แก้ selector ตรงนี้ที่เดียว
// ------------------------------------------------------------

import { expect } from "@playwright/test";

export async function loginWithEmail(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
}

export async function loginWithStaffPin(page, username, pin) {
  await page.goto("/staff-login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel(/PIN/).fill(pin);
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
}

/** รอจน login สำเร็จแล้ว redirect ออกจากหน้า /login หรือ /staff-login */
export async function expectLoginSucceeded(page) {
  await expect(page).not.toHaveURL(/\/login|\/staff-login/, { timeout: 10_000 });
}

/** ตรวจว่า login ล้มเหลว และยังค้างอยู่หน้าเดิมพร้อม error message */
export async function expectLoginFailed(page, { onPath } = {}) {
  const errorLocator = page.locator(".msg.error");
  await expect(errorLocator).toBeVisible({ timeout: 8_000 });
  if (onPath) {
    await expect(page).toHaveURL(new RegExp(onPath));
  }
  return errorLocator;
}

/** ตรวจว่าหน้าปัจจุบันแสดง RequireAuth role-forbidden message */
export async function expectRoleForbidden(page, roleName) {
  const forbidden = page.locator(".msg.error", {
    hasText: `บทบาท "${roleName}" ของคุณไม่มีสิทธิ์เข้าหน้านี้`,
  });
  await expect(forbidden).toBeVisible({ timeout: 8_000 });
}

/** ตรวจว่าหน้าปัจจุบันคือหน้า disabled-account จาก RequireAuth.js */
export async function expectDisabledAccountScreen(page) {
  await expect(page.getByText("บัญชีนี้ถูกปิดการใช้งาน")).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole("button", { name: "ออกจากระบบ" })
  ).toBeVisible();
}

/** ตรวจว่าถูก redirect ไปหน้า /signup (memberships.length === 0) */
export async function expectRedirectedToSignup(page) {
  await expect(page).toHaveURL(/\/signup/, { timeout: 8_000 });
}

export async function signOut(page) {
  // ปรับ selector ตรงนี้ถ้า AppShell ใช้ label อื่นสำหรับปุ่ม sign out
  const signOutBtn = page.getByRole("button", { name: /ออกจากระบบ|sign ?out/i });
  if (await signOutBtn.isVisible().catch(() => false)) {
    await signOutBtn.click();
  }
}
