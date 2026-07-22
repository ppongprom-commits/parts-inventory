// การ์ด "Job Assignment Status Tracking — เริ่มงาน/หยุดชั่วคราว/เสร็จงาน ต่อ job ที่ถูก assign"
// คืนวันที่ 21 ก.ค. 2026 — app/jobs/[id]/page.js: ปุ่ม state machine แทน raw <select> เดิม
// State machine เต็ม: pending -> in_progress -> on_hold -> in_progress -> done (ห้ามข้ามขั้น
// บังคับที่ DB trigger enforce_workflow_step_status_transition ไม่ใช่แค่ UI ซ่อนปุ่ม)
import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { fillBasicJobForm, submitJobForm, expectJobSavedSuccessfully, addWorkflowStepOnDetailPage,
  clickStartStep, clickHoldStep, clickResumeStep, clickCompleteStep, expectNoStepActions } from "../fixtures/job-helpers.js";
import { adminClient, getShopIdByName, getUserIdByUsername, signInStaff } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let technicianUserId;
let jobId;
let stepId;
const createdJobIds = [];

test.describe.configure({ mode: "serial" }); // ต้องเรียงลำดับ — แต่ละ test สืบสถานะจาก test ก่อนหน้า

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  technicianUserId = await getUserIdByUsername(mainShopId, accounts.technician.username);
});

test.afterAll(async () => {
  for (const id of createdJobIds) {
    await adminClient().from("jobs").delete().eq("job_id", id);
  }
});

test("JOBSTAT-001 owner สร้างงาน + เพิ่มขั้นตอน มอบหมายให้ technician", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);

  const marker = `QA-JOBSTAT-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await submitJobForm(page);
  jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const stepName = `ถอดชิ้นส่วน ${Date.now()}`;
  await addWorkflowStepOnDetailPage(page, { name: stepName, assigneeUserId: technicianUserId });

  await expect(page.getByText(stepName)).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient()
    .from("job_workflow_steps")
    .select("step_id, status, assigned_to")
    .eq("job_id", jobId)
    .eq("step_name", stepName)
    .single();
  stepId = data.step_id;
  expect(data.status).toBe("pending");
  expect(data.assigned_to).toBe(technicianUserId);
});

test("JOBSTAT-002 พนักงานที่ไม่ถูก assign (assistant) ไม่เห็นปุ่ม action ใดๆ บนขั้นตอนนี้เลย", async ({ page }) => {
  await loginWithStaffPin(page, accounts.assistant.username, accounts.assistant.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);
  await expectNoStepActions(page, stepId);
});

test("JOBSTAT-003 technician ที่ถูก assign กด 'เริ่มงาน' -> in_progress + บันทึก started_at อัตโนมัติ", async ({ page }) => {
  await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await clickStartStep(page, stepId);
  await expect(page.getByTestId(`hold-step-${stepId}`)).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient()
    .from("job_workflow_steps")
    .select("status, started_at")
    .eq("step_id", stepId)
    .single();
  expect(data.status).toBe("in_progress");
  expect(data.started_at).not.toBeNull();
});

test("JOBSTAT-004 หยุดชั่วคราวโดยไม่กรอกเหตุผล -> error message, ไม่เปลี่ยนสถานะ", async ({ page }) => {
  await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await page.getByTestId(`hold-step-${stepId}`).click();
  await page.getByTestId(`confirm-hold-${stepId}`).click(); // ไม่กรอกเหตุผลเลย

  await expect(page.locator(".msg.error", { hasText: "กรุณาระบุเหตุผลที่หยุดงานก่อนกดยืนยัน" })).toBeVisible({
    timeout: 8000,
  });

  const { data } = await adminClient().from("job_workflow_steps").select("status").eq("step_id", stepId).single();
  expect(data.status).toBe("in_progress"); // ยังไม่เปลี่ยน
});

test("JOBSTAT-005 หยุดชั่วคราวพร้อมเหตุผล -> on_hold + held_at/hold_reason ถูกบันทึก", async ({ page }) => {
  await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  const reason = "รออะไหล่มาส่ง";
  await clickHoldStep(page, stepId, reason);

  await expect(page.getByTestId(`resume-step-${stepId}`)).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient()
    .from("job_workflow_steps")
    .select("status, hold_reason, held_at")
    .eq("step_id", stepId)
    .single();
  expect(data.status).toBe("on_hold");
  expect(data.hold_reason).toBe(reason);
  expect(data.held_at).not.toBeNull();
});

test("JOBSTAT-006 กด 'ทำต่อ' -> กลับเป็น in_progress แล้วกด 'เสร็จงาน' -> done + completed_at", async ({ page }) => {
  await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await clickResumeStep(page, stepId);
  await expect(page.getByTestId(`complete-step-${stepId}`)).toBeVisible({ timeout: 8000 });

  await clickCompleteStep(page, stepId);
  await expect(page.getByText(/เสร็จเมื่อ/)).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient()
    .from("job_workflow_steps")
    .select("status, completed_at")
    .eq("step_id", stepId)
    .single();
  expect(data.status).toBe("done");
  expect(data.completed_at).not.toBeNull();
});

test("JOBSTAT-007 DB trigger ปฏิเสธการข้ามลำดับสถานะ (pending -> done ตรงๆ) แม้ยิงตรงข้าม UI", async () => {
  // สร้าง step ใหม่แยกต่างหาก (step เดิมจาก test ก่อนหน้าจบที่ done แล้ว ทดสอบซ้ำไม่ได้)
  const { data: newStep, error: insertErr } = await adminClient()
    .from("job_workflow_steps")
    .insert({ job_id: jobId, shop_id: mainShopId, step_order: 99, step_name: "QA-skip-ahead-test", assigned_to: technicianUserId })
    .select("step_id")
    .single();
  expect(insertErr).toBeNull();

  const { client: techClient } = await signInStaff(accounts.technician.username, accounts.technician.pin);
  const { error } = await techClient.from("job_workflow_steps").update({ status: "done" }).eq("step_id", newStep.step_id);

  expect(error, "ห้ามข้ามจาก pending ไป done ตรงๆ ต้องผ่าน in_progress ก่อนเสมอ").not.toBeNull();
  expect(error.message).toContain("ห้ามข้ามขั้นตอน");

  await adminClient().from("job_workflow_steps").delete().eq("step_id", newStep.step_id);
});

test("JOBSTAT-008 DB trigger ปฏิเสธคนที่ไม่ถูก assign และไม่ใช่ supervisor ขึ้นไป (assistant พยายามอัปเดตตรงๆ)", async () => {
  const { data: newStep, error: insertErr } = await adminClient()
    .from("job_workflow_steps")
    .insert({ job_id: jobId, shop_id: mainShopId, step_order: 100, step_name: "QA-permission-test", assigned_to: technicianUserId })
    .select("step_id")
    .single();
  expect(insertErr).toBeNull();

  const { client: assistantClient } = await signInStaff(accounts.assistant.username, accounts.assistant.pin);
  const { error } = await assistantClient
    .from("job_workflow_steps")
    .update({ status: "in_progress" })
    .eq("step_id", newStep.step_id);

  expect(error, "assistant ไม่ได้ถูก assign และไม่ใช่ supervisor ขึ้นไป ต้องถูกปฏิเสธ").not.toBeNull();
  expect(error.message).toContain("ไม่มีสิทธิ์เปลี่ยนสถานะ");

  await adminClient().from("job_workflow_steps").delete().eq("step_id", newStep.step_id);
});
