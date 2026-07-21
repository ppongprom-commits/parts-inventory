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

// ------------------------------------------------------------
// การ์ด "Job Assignment Status Tracking" (คืนวันที่ 21 ก.ค. 2026) — ปุ่ม state machine ที่
// app/jobs/[id]/page.js แทน raw <select> เดิม — selector ทั้งหมดอิง data-testid ที่ผูกกับ
// step_id จริง (ต้องรู้ step_id ก่อนเรียก helper พวกนี้ — ดึงจาก DB ตรงหลัง addWorkflowStep
// ผ่าน db-client.js หรือจาก response ตอน insert ก็ได้)
// state machine จริง: pending -> in_progress -> on_hold -> in_progress -> done (ห้ามข้ามขั้น
// บังคับที่ DB trigger enforce_workflow_step_status_transition ไม่ใช่แค่ UI ซ่อนปุ่ม)
// ------------------------------------------------------------

/** เพิ่มขั้นตอนงานจากหน้า /jobs/[id] (ต่างจาก addWorkflowStep ด้านบนที่กรอกตอนสร้างงานใหม่ที่
 *  /jobs/new) — input ไม่มี label/data-testid เป็นของตัวเอง ใช้ placeholder ที่ไม่ซ้ำใครหาตัว
 *  input แล้วเดินไปหา select/button ข้างๆ ด้วย XPath sibling (ทั้งแถวเป็น flex div เดียวกัน —
 *  ระวัง: หน้านี้มีปุ่ม "+ เพิ่ม" อีกอันในส่วนรายการค่าใช้จ่ายด้านล่าง ชื่อซ้ำกัน ห้ามใช้
 *  getByRole('button', {name: '+ เพิ่ม'}) เฉยๆ เพราะจะกำกวม) ต้อง goto /jobs/{jobId} เองก่อนเรียก */
export async function addWorkflowStepOnDetailPage(page, { name, assigneeUserId } = {}) {
  const stepNameInput = page.getByPlaceholder("ขั้นตอนใหม่ เช่น สั่งอะไหล่");
  await stepNameInput.fill(name);
  if (assigneeUserId) {
    const assigneeSelect = stepNameInput.locator("xpath=following-sibling::select[1]");
    await assigneeSelect.selectOption(assigneeUserId);
  }
  const addBtn = stepNameInput.locator("xpath=following-sibling::button[1]");
  await addBtn.click();
}

export async function clickStartStep(page, stepId) {
  await page.getByTestId(`start-step-${stepId}`).click();
}

export async function clickHoldStep(page, stepId, reason) {
  await page.getByTestId(`hold-step-${stepId}`).click();
  await page.getByTestId(`hold-reason-input-${stepId}`).fill(reason);
  await page.getByTestId(`confirm-hold-${stepId}`).click();
}

export async function clickResumeStep(page, stepId) {
  await page.getByTestId(`resume-step-${stepId}`).click();
}

export async function clickCompleteStep(page, stepId) {
  await page.getByTestId(`complete-step-${stepId}`).click();
}

/** ตรวจว่า step นี้ไม่มีปุ่ม action ใดๆ โชว์เลย (canActOnStep() === false ใน page.js จริง —
 *  ไม่ใช่ assigned คนนี้ และไม่ใช่ owner/manager/supervisor) — container div ยังอยู่ใน DOM เสมอ
 *  (data-testid ติดอยู่ที่ตัว div ไม่ใช่เนื้อหาข้างใน) แต่ไม่มี children เลยตอน canActOnStep()
 *  เป็น false จึงไม่ใช้ toBeVisible() ตรงๆ กับ div ที่ว่างเปล่า (0x0 bounding box ตาม CSS flex
 *  ไม่มี children จะทำให้ toBeVisible() timeout โดยไม่ใช่บั๊กจริงของแอป) เช็คแค่จำนวนปุ่มแทน */
export async function expectNoStepActions(page, stepId) {
  const actions = page.getByTestId(`step-actions-${stepId}`);
  await expect(actions).toBeAttached();
  await expect(actions.locator("button")).toHaveCount(0);
}
