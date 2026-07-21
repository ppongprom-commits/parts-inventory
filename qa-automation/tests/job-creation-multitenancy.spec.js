import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

let foreignShopId; // "QA Platform-Admin Owner Shop (auto)" — owner ไม่มีความเกี่ยวข้องกับ shop หลักเลย
let foreignGroupId;

test.beforeAll(async () => {
  foreignShopId = await getShopIdByName("QA Platform-Admin Owner Shop (auto)");

  const { data, error } = await adminClient()
    .from("visibility_groups")
    .insert({ shop_id: foreignShopId, name: "FOREIGN SHOP GROUP — should never leak" })
    .select("group_id")
    .single();
  if (error) throw error;
  foreignGroupId = data.group_id;
});

test.afterAll(async () => {
  if (foreignGroupId) {
    await adminClient().from("visibility_groups").delete().eq("group_id", foreignGroupId);
  }
});

test("JOB-801 กลุ่ม/สมาชิกของอู่อื่นต้องไม่หลุดมาในฟอร์มสร้างงานของอู่หลัก", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/jobs/new");

  // กลุ่มของอู่อื่นต้องไม่ปรากฏเป็น toggle button ให้เลือกเลย
  await expect(page.getByRole("button", { name: /FOREIGN SHOP GROUP/ })).toHaveCount(0);

  // กลุ่มของอู่หลักเอง (ที่ setup-test-data.mjs สร้างไว้) ต้องยังเห็นปกติ — sanity ว่า query ทำงานจริง
  await expect(page.getByRole("button", { name: /QA Test Group A/ })).toBeVisible();

  // ช่องมอบหมายขั้นตอนงาน (dropdown สมาชิก) ต้องไม่มีใครจากอู่อื่นปนมาด้วย
  const assigneeSelect = page.locator("select").filter({ has: page.locator('option:has-text("ยังไม่มอบหมาย")') });
  const optionTexts = await assigneeSelect.locator("option").allTextContents();
  // เช็คว่าไม่มี option ไหนที่เป็นอีเมล/username ของ ownerPlatformAdmin (เจ้าของอู่ต่างหาก) หลุดมา
  expect(optionTexts.some((t) => t.includes(accounts.ownerPlatformAdmin.email))).toBe(false);
});
