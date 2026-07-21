// Card: "Job Assignment Status Tracking — เริ่มงาน/หยุดชั่วคราว/เสร็จงาน ต่อ job ที่ถูก assign"
//
// State machine: pending(=มอบหมายแล้ว รอเริ่ม) -> in_progress -> on_hold -> in_progress -> done
// (ห้ามข้ามลำดับ เช่น pending -> done ตรงๆ)
//
// ⚠️ Schema drift discovery ระหว่างทำการ์ดนี้: DB บน staging มี trigger
// enforce_workflow_step_status_transition + update_job_workflow_step_timestamps อยู่แล้วจริง
// (บังคับสิทธิ์ + ลำดับ state + auto timestamp ที่ DB layer) จากเซสชันก่อนหน้าที่การ์ดถูก mark
// "In progress" แต่ไม่เคย commit — export กลับเป็น
// db/job_assignment_status_tracking_migration.sql แล้ว งานที่เพิ่มจริงในรอบนี้คือ "UI" เท่านั้น
// (ปุ่ม เริ่มงาน/หยุดชั่วคราว/ทำต่อ/เสร็จงาน แทน raw <select> ที่ปล่อยให้ตั้งสถานะอะไรก็ได้)
//
// เทสชุดนี้ (เหมือน qa-tests อื่นในโปรเจกต์) ครอบเฉพาะ UI logic ผ่าน network mock ทั้งหมด — ไม่ได้
// พิสูจน์ DB trigger จริง (ทำไม่ได้ในแซนด์บ็อกซ์นี้ที่ไม่มี network ออก *.supabase.co)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "42";
const QA_USER_ID = "a11d07c6-0c2e-49b6-ba64-85a3d6f7cee5"; // ตรงกับ QA_USER ใน mockAuth.js
const OTHER_USER_ID = "99999999-9999-9999-9999-999999999999";

function jobRow() {
  return {
    job_id: Number(JOB_ID),
    shop_id: SHOP_ID,
    customer_name: "ลูกค้าทดสอบ",
    status: "in_progress",
    damage_points: [],
    vat_type: "none",
    car_diagram_type: "sedan",
    created_at: "2026-07-19T10:00:00Z",
    updated_at: "2026-07-19T10:00:00Z",
  };
}

async function mockJobRoutes(page, { steps, patchCapture }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/jobs") && url.includes(`job_id=eq.${JOB_ID}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobRow()) });
    }
    if (url.includes("/rest/v1/job_workflow_steps")) {
      if (method === "PATCH") {
        const body = req.postDataJSON();
        if (patchCapture) patchCapture.push(body);
        // จำลอง DB trigger คร่าวๆ พอให้เทส error path ได้ (ไม่ใช่การพิสูจน์ trigger จริง)
        const stepIdMatch = url.match(/step_id=eq\.(\d+)/);
        const step = steps.find((s) => String(s.step_id) === (stepIdMatch && stepIdMatch[1]));
        if (body.status === "on_hold" && (!body.hold_reason || !body.hold_reason.trim())) {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: "new row for relation \"job_workflow_steps\" violates check constraint \"job_workflow_steps_hold_reason_required\"" }),
          });
        }
        if (step) Object.assign(step, body);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([step].filter(Boolean)) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(steps) });
    }
    // สำคัญ (defect เจอรอบ 1): route handler ที่ลงทะเบียนทีหลัง (installMockAuth ก่อน,
    // mockJobRoutes ทีหลัง) จะทำงาน "ก่อน" — ถ้า fulfill ทุกอย่างเองหมด จะ override การ mock
    // auth/v1/user, shop_members ฯลฯ ของ mockAuth.js ไปด้วย ทำให้ AuthProvider คิดว่า user ยังไม่มี
    // shop membership แล้ว redirect ไปหน้า onboarding ("ตั้งชื่ออู่") แทนที่จะเห็นหน้า job เลย —
    // ต้อง fallback() ให้ mockAuth.js จัดการ route อื่นที่ไม่ใช่ jobs/job_workflow_steps ต่อ
    return route.fallback();
  });
}

test.describe("Job Assignment Status Tracking — state machine buttons", () => {
  test("assignee sees 'เริ่มงาน' on a pending step and it transitions to in_progress", async ({ page }) => {
    const steps = [
      { step_id: 1, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "ถอดกันชน", assigned_to: QA_USER_ID, status: "pending", started_at: null, completed_at: null, hold_reason: null, held_at: null },
    ];
    const patchCapture = [];
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByTestId("start-step-1")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("start-step-1").click();

    await expect.poll(() => patchCapture.length).toBeGreaterThan(0);
    expect(patchCapture[0]).toMatchObject({ status: "in_progress" });
  });

  test("hold requires a non-empty reason before it submits", async ({ page }) => {
    const steps = [
      { step_id: 2, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "พ่นสี", assigned_to: QA_USER_ID, status: "in_progress", started_at: "2026-07-20T09:00:00Z", completed_at: null, hold_reason: null, held_at: null },
    ];
    const patchCapture = [];
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByTestId("hold-step-2")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("hold-step-2").click();
    await expect(page.getByTestId("confirm-hold-2")).toBeVisible();
    // ไม่กรอกเหตุผลเลย กดยืนยันทันที — ต้อง block ฝั่ง client ไม่ยิง PATCH ออกไปเลย
    await page.getByTestId("confirm-hold-2").click();
    await expect(page.getByText("กรุณาระบุเหตุผลที่หยุดงาน")).toBeVisible();
    expect(patchCapture.length).toBe(0);

    // กรอกเหตุผลแล้วกดยืนยัน — ยิง PATCH พร้อม hold_reason
    await page.getByTestId("hold-reason-input-2").fill("รอสีเข้าเพิ่ม");
    await page.getByTestId("confirm-hold-2").click();
    await expect.poll(() => patchCapture.length).toBeGreaterThan(0);
    expect(patchCapture[0]).toMatchObject({ status: "on_hold", hold_reason: "รอสีเข้าเพิ่ม" });
  });

  test("on_hold step shows the reason and a 'ทำต่อ' button", async ({ page }) => {
    const steps = [
      { step_id: 3, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "เช็คระบบไฟ", assigned_to: QA_USER_ID, status: "on_hold", started_at: "2026-07-20T09:00:00Z", completed_at: null, hold_reason: "รออะไหล่เพิ่ม", held_at: "2026-07-20T10:00:00Z" },
    ];
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture: [] });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByText(/รออะไหล่เพิ่ม/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("resume-step-3")).toBeVisible();
    // ห้ามมีปุ่ม "เสร็จงาน" ตรงจาก on_hold (ต้องผ่าน in_progress ก่อนตาม state machine)
    await expect(page.getByTestId("complete-step-3")).toHaveCount(0);
  });

  test("a technician who is NOT assigned and below supervisor sees no action buttons", async ({ page }) => {
    const steps = [
      { step_id: 4, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "ขัดเงา", assigned_to: OTHER_USER_ID, status: "pending", started_at: null, completed_at: null, hold_reason: null, held_at: null },
    ];
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture: [] });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByText("📝 ขั้นตอนการทำงาน")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("start-step-4")).toHaveCount(0);
    // container ว่างเปล่า (ไม่มีปุ่มเลย) ยุบเหลือ 0x0 — toBeVisible() มองว่า "ไม่ visible" ทั้งที่มันคือ
    // ผลลัพธ์ที่ถูกต้องของเทสนี้ (defect เจอรอบ 1 — เป็นบั๊กของเทสเอง ไม่ใช่ของโค้ดจริง) เช็คแค่ว่า
    // container อยู่ใน DOM จริง (attached) และไม่มีปุ่มข้างในเลยแทน
    await expect(page.getByTestId("step-actions-4")).toBeAttached();
    await expect(page.getByTestId("step-actions-4").locator("button")).toHaveCount(0);
  });

  test("a supervisor CAN act on a step assigned to someone else", async ({ page }) => {
    const steps = [
      { step_id: 5, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "ตรวจสอบขั้นสุดท้าย", assigned_to: OTHER_USER_ID, status: "pending", started_at: null, completed_at: null, hold_reason: null, held_at: null },
    ];
    const patchCapture = [];
    await installMockAuth(page, { role: "supervisor", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByTestId("start-step-5")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("start-step-5").click();
    await expect.poll(() => patchCapture.length).toBeGreaterThan(0);
  });

  test("a completed step shows no action buttons (terminal state)", async ({ page }) => {
    const steps = [
      { step_id: 6, job_id: Number(JOB_ID), shop_id: SHOP_ID, step_order: 1, step_name: "ส่งมอบรถ", assigned_to: QA_USER_ID, status: "done", started_at: "2026-07-19T09:00:00Z", completed_at: "2026-07-19T12:00:00Z", hold_reason: null, held_at: null },
    ];
    await installMockAuth(page, { role: "technician", shopId: SHOP_ID });
    await mockJobRoutes(page, { steps, patchCapture: [] });
    await page.goto(`/jobs/${JOB_ID}`);

    await expect(page.getByText(/เสร็จเมื่อ/)).toBeVisible({ timeout: 15000 });
    const actions = page.getByTestId("step-actions-6");
    await expect(actions).toBeAttached();
    await expect(actions.locator("button")).toHaveCount(0);
  });
});
