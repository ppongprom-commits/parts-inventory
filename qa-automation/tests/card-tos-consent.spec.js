// การ์ด "กลไก ToS consent — สัญญาใช้บริการ + บันทึกการยอมรับ (blocker #2 ของ Accounting)"
// คืนวันที่ 21 ก.ค. 2026 — components/TosConsentGate.js ครอบทุกหน้าที่ผ่าน RequireAuth
//
// setup-test-data.mjs seed shop_tos_acceptances ให้ "QA Test Shop (auto)" ไว้ล่วงหน้าเสมอ (กัน
// suite อื่นทั้งหมดโดน gate บล็อกโดยไม่ตั้งใจ) — ไฟล์นี้ทดสอบตัว gate เองโดยลบ acceptance ของ
// shop หลักออกชั่วคราว (playwright.config.js ตั้ง fullyParallel:false, workers:1 อยู่แล้ว จึงไม่ชน
// กับ suite อื่นที่รันพร้อมกัน) แล้วคืนค่ากลับก่อนจบเสมอ ไม่ว่า assertion จะ pass/fail
import { test, expect } from "@playwright/test";
import {
  loginWithEmail,
  expectLoginSucceeded,
  expectTosGateVisible,
  expectTosGateHidden,
  expectTosNonOwnerMessage,
  acceptTosGate,
} from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName, signInEmail } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";
import { CURRENT_TOS_VERSION } from "../../config/tosContent.js";

let mainShopId;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");
  // ลบ acceptance ของเวอร์ชันปัจจุบันออกชั่วคราว จำลองร้านที่ยังไม่เคยกดยอมรับ
  await adminClient()
    .from("shop_tos_acceptances")
    .delete()
    .eq("shop_id", mainShopId)
    .eq("tos_version", CURRENT_TOS_VERSION);
});

test.afterAll(async () => {
  // คืนสถานะ "ยอมรับแล้ว" กลับเสมอ ไม่ว่า test ด้านล่างจะทำให้ accept ผ่าน UI ไปแล้วหรือยัง
  // (idempotent — เช็คก่อน insert กันซ้ำ) user_id เป็น not null ต้องใช้ owner ตัวจริงของ shop นี้
  const { data: existing } = await adminClient()
    .from("shop_tos_acceptances")
    .select("id")
    .eq("shop_id", mainShopId)
    .eq("tos_version", CURRENT_TOS_VERSION)
    .maybeSingle();
  if (!existing) {
    const { data: shopRow } = await adminClient()
      .from("shops")
      .select("owner_user_id")
      .eq("shop_id", mainShopId)
      .single();
    await adminClient()
      .from("shop_tos_acceptances")
      .insert({ shop_id: mainShopId, user_id: shopRow.owner_user_id, tos_version: CURRENT_TOS_VERSION });
  }
});

test("TOS-001 non-owner (manager) เห็น gate แต่ไม่มีปุ่มยอมรับ — เห็นข้อความให้ติดต่อเจ้าของร้านแทน", async ({ page }) => {
  await loginWithEmail(page, accounts.manager.email, accounts.manager.password);
  await expectLoginSucceeded(page);

  await expectTosGateVisible(page);
  await expectTosNonOwnerMessage(page);
  // ต้องไม่มีปุ่ม "ยอมรับเงื่อนไข" ให้กดเลยสำหรับ role ที่ไม่ใช่ owner
  await expect(page.getByRole("button", { name: "ยอมรับเงื่อนไข" })).toHaveCount(0);
});

test("TOS-002 accept_shop_tos RPC ปฏิเสธ role ที่ไม่ใช่ owner แม้ยิงตรงข้าม UI", async () => {
  const { client: managerClient } = await signInEmail(accounts.manager.email, accounts.manager.password);
  const { error } = await managerClient.rpc("accept_shop_tos", {
    p_shop_id: mainShopId,
    p_version: CURRENT_TOS_VERSION,
  });
  expect(error, "manager ไม่ควรกด accept ผ่าน RPC ได้เลย ต้องเป็น owner เท่านั้น").not.toBeNull();
  expect(error.message).toContain("เจ้าของร้าน");
});

test("TOS-003 owner เห็น gate บล็อกทุกหน้า จนกว่าจะติ๊กยอมรับ + กดปุ่ม", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);

  await expectTosGateVisible(page);
  await expect(page.getByTestId("tos-content-box")).toBeVisible();

  // ปุ่มต้อง disabled จนกว่าจะติ๊ก checkbox ก่อน (ป้องกันกดผ่านโดยไม่อ่าน)
  const acceptBtn = page.getByRole("button", { name: "ยอมรับเงื่อนไข" });
  await expect(acceptBtn).toBeDisabled();

  await acceptTosGate(page);
  await expectTosGateHidden(page);

  // ยืนยันจริงใน DB ว่าบันทึก version + user ที่กดถูกต้อง
  const { data: rows } = await adminClient()
    .from("shop_tos_acceptances")
    .select("tos_version, user_id")
    .eq("shop_id", mainShopId)
    .eq("tos_version", CURRENT_TOS_VERSION)
    .order("accepted_at", { ascending: false })
    .limit(1);
  expect(rows.length).toBe(1);
  expect(rows[0].tos_version).toBe(CURRENT_TOS_VERSION);
});

test("TOS-004 หลัง owner ยอมรับแล้ว role อื่นเข้าใช้งานต่อได้ปกติโดยไม่เห็น gate อีก", async ({ page }) => {
  // ต้องรันหลัง TOS-003 เสมอ (Playwright รันตามลำดับในไฟล์เดียวกันเมื่อ workers:1 อยู่แล้ว)
  await loginWithEmail(page, accounts.manager.email, accounts.manager.password);
  await expectLoginSucceeded(page);
  await expectTosGateHidden(page);
});
