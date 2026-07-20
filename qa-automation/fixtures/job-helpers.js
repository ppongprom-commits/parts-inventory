// ------------------------------------------------------------
// Helper สำหรับกรอกฟอร์ม /jobs/new — selector อ้างอิงจาก app/jobs/new/page.js จริง
// ------------------------------------------------------------
import { expect } from "@playwright/test";

/**
 * กรอกฟอร์มสร้างงานใหม่ (เฉพาะ field พื้นฐาน ไม่รวมรูป/แผนภาพ/visibility group/workflow steps
 * ซึ่งมี helper แยกเฉพาะทางด้านล่าง เพราะ UI ซับซ้อนกว่า text input ธรรมดา)
 */
export async function fillBasicJobForm(page, fields = {}) {
  await page.goto("/jobs/new");

  if (fields.customerName !== undefined) {
    await page.getByLabel("ชื่อลูกค้า").fill(fields.customerName);
  }
  if (fields.customerPhone !== undefined) {
    await page.getByLabel("เบอร์โทรลูกค้า").fill(fields.customerPhone);
  }
  if (fields.customerAddress !== undefined) {
    await page.getByLabel(/ที่อยู่ลูกค้า/).fill(fields.customerAddress);
  }
  if (fields.licensePlate !== undefined) {
    await page.getByLabel("ทะเบียนรถ").fill(fields.licensePlate);
  }
  if (fields.carBrand !== undefined) {
    await page.getByLabel("ยี่ห้อรถ").fill(fields.carBrand);
  }
  if (fields.carModel !== undefined) {
    await page.getByLabel("รุ่นรถ").fill(fields.carModel);
  }
  if (fields.sourceType !== undefined) {
    await page.getByLabel("ที่มา").selectOption(fields.sourceType);
  }
  if (fields.notes !== undefined) {
    await page.getByLabel("หมายเหตุ").fill(fields.notes);
  }
}

/** เลือก visibility group ตามชื่อ (toggle button — ดู app/jobs/new/page.js บรรทัด groups.map) */
export async function toggleVisibilityGroup(page, groupName) {
  await page.getByRole("button", { name: new RegExp(groupName) }).click();
}

/** เพิ่มแถวขั้นตอนงาน + กรอกชื่อ (แถวแรกมีอยู่แล้วตั้งแต่ต้น ไม่ต้องกด + เพิ่มสำหรับแถวแรก) */
export async function addWorkflowStep(page, index, stepName) {
  if (index > 0) {
    await page.getByRole("button", { name: "+ เพิ่มขั้นตอน" }).click();
  }
  const stepInputs = page.locator('input[placeholder="เช่น รื้อตรวจสภาพ"]');
  await stepInputs.nth(index).fill(stepName);
}

export async function submitJobForm(page) {
  await page.getByRole("button", { name: /รับงานเข้าอู่/ }).click();
}

export async function expectJobSavedSuccessfully(page) {
  await expect(page.locator(".msg.success", { hasText: "รับงานเรียบร้อยแล้ว" })).toBeVisible({
    timeout: 8000,
  });
  await expect(page).toHaveURL(/\/jobs\/\d+/, { timeout: 8000 });
  const match = page.url().match(/\/jobs\/(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function expectJobSaveFailed(page) {
  await expect(page.locator(".msg.error", { hasText: "บันทึกไม่สำเร็จ" })).toBeVisible({
    timeout: 8000,
  });
}
