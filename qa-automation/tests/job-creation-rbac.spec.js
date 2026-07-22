import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { fillBasicJobForm, submitJobForm, expectJobSavedSuccessfully } from "../fixtures/job-helpers.js";
import { adminClient, getShopIdByName, signInStaff } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
const createdJobIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
});

test.afterAll(async () => {
  for (const id of createdJobIds) {
    await adminClient().from("jobs").delete().eq("job_id", id);
  }
});

test.describe("JOB-601 — ทั้ง 5 role สร้างงานได้ปกติ (sanity)", () => {
  const roleLogins = [
    ["owner", async (page) => loginWithEmail(page, accounts.owner.email, accounts.owner.password)],
    ["manager", async (page) => loginWithEmail(page, accounts.manager.email, accounts.manager.password)],
    ["supervisor", async (page) => loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin)],
    ["technician", async (page) => loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin)],
    ["assistant", async (page) => loginWithStaffPin(page, accounts.assistant.username, accounts.assistant.pin)],
  ];

  for (const [roleName, doLogin] of roleLogins) {
    test(`${roleName} สร้างงานสำเร็จ`, async ({ page }) => {
      await doLogin(page);
      await expectLoginSucceeded(page);

      const marker = `QA-JOB-601-${roleName}-${Date.now()}`;
      await fillBasicJobForm(page, { customerName: marker });
      await submitJobForm(page);
      const jobId = await expectJobSavedSuccessfully(page);
      createdJobIds.push(jobId);
    });
  }
});

test("JOB-602 assistant สร้างงานสำเร็จ แต่แก้ไข/อัปเดตสถานะงานที่ตัวเองสร้างไม่ได้เลย", async ({ page }) => {
  await loginWithStaffPin(page, accounts.assistant.username, accounts.assistant.pin);
  await expectLoginSucceeded(page);

  const marker = `QA-JOB-602-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  // ลองอัปเดตงานที่ตัวเองเพิ่งสร้างเอง ผ่าน client เดียวกับที่แอปใช้ (publishable key)
  const { client: assistantClient } = await signInStaff(accounts.assistant.username, accounts.assistant.pin);
  const { data, error } = await assistantClient
    .from("jobs")
    .update({ status: "in_progress" })
    .eq("job_id", jobId)
    .select();

  expect(error).toBeNull(); // RLS ปฏิเสธแบบ "0 แถวถูกแก้" ไม่ใช่ error
  expect(data, "assistant ไม่ควรแก้ไขงานได้แม้จะเป็นคนสร้างเองก็ตาม (update policy ไม่รวม assistant)").toEqual([]);

  const { data: verifyUnchanged } = await adminClient()
    .from("jobs")
    .select("status")
    .eq("job_id", jobId)
    .single();
  expect(verifyUnchanged.status).toBe("received");
});

test.describe("JOB-603 — is_shop_active() gate: shop suspended/canceled บล็อกการสร้างงาน", () => {
  let originalStatus;

  test.beforeAll(async () => {
    const { data } = await adminClient()
      .from("shops")
      .select("subscription_status")
      .eq("shop_id", mainShopId)
      .single();
    originalStatus = data.subscription_status;
  });

  test.afterEach(async () => {
    // คืนค่าเดิมเสมอ ไม่ว่า assertion จะ pass/fail กันอู่หลักพังสำหรับ suite อื่น
    await adminClient().from("shops").update({ subscription_status: originalStatus }).eq("shop_id", mainShopId);
  });

  for (const blockedStatus of ["suspended", "canceled"]) {
    test(`สร้างงานไม่ได้เมื่อ subscription_status='${blockedStatus}'`, async ({ page }) => {
      await adminClient()
        .from("shops")
        .update({ subscription_status: blockedStatus })
        .eq("shop_id", mainShopId);

      await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
      await expectLoginSucceeded(page);

      const marker = `QA-JOB-603-${blockedStatus}-${Date.now()}`;
      await fillBasicJobForm(page, { customerName: marker });
      await submitJobForm(page);

      // คาดว่า insert ถูกบล็อกที่ RLS (is_shop_active ตรวจ subscription_status) —
      // ข้อความ error ที่เห็นน่าจะเป็น raw Postgres RLS message ("new row violates row-level
      // security policy...") ซึ่งเป็นศัพท์เทคนิคเกินไปสำหรับผู้ใช้ทั่วไป (เหมือน pattern ที่เจอใน /login)
      await expect(page.locator(".msg.error", { hasText: "บันทึกไม่สำเร็จ" })).toBeVisible({
        timeout: 8000,
      });

      const { data: shouldNotExist } = await adminClient()
        .from("jobs")
        .select("job_id")
        .eq("shop_id", mainShopId)
        .eq("customer_name", marker)
        .maybeSingle();
      expect(shouldNotExist).toBeNull();
    });
  }
});
