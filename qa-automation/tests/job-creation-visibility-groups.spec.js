import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import {
  fillBasicJobForm,
  toggleVisibilityGroup,
  submitJobForm,
  expectJobSavedSuccessfully,
  expectJobSaveFailed,
} from "../fixtures/job-helpers.js";
import { adminClient, getShopIdByName, signInEmail, signInStaff } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

let mainShopId;
let groupAId; // "QA Test Group A" — seeded โดย setup-test-data.mjs, มี supervisor เป็นสมาชิก
let groupBId; // สร้างเฉพาะไฟล์นี้ สำหรับเทสต์ multi-group (JOB-205)
const createdJobIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");

  const { data: groupA, error: groupAErr } = await adminClient()
    .from("visibility_groups")
    .select("group_id")
    .eq("shop_id", mainShopId)
    .eq("name", "QA Test Group A")
    .single();
  if (groupAErr) {
    throw new Error(
      `ไม่พบ "QA Test Group A" — รัน npm run setup:data ให้เสร็จก่อน หรือดู job-00-schema-preflight.spec.js ว่าผ่านหรือยัง: ${groupAErr.message}`
    );
  }
  groupAId = groupA.group_id;

  const { data: groupB, error: groupBErr } = await adminClient()
    .from("visibility_groups")
    .insert({ shop_id: mainShopId, name: "QA Test Group B (multi-group test)" })
    .select("group_id")
    .single();
  if (groupBErr) throw groupBErr;
  groupBId = groupB.group_id;
  // ใส่ assistant เป็นสมาชิกกลุ่ม B (ต่างจากกลุ่ม A ที่มี supervisor) เพื่อทดสอบ OR logic ใน JOB-205
  const { data: assistantMember } = await adminClient()
    .from("shop_members")
    .select("user_id")
    .eq("shop_id", mainShopId)
    .eq("login_username", accounts.assistant.username)
    .single();
  await adminClient()
    .from("visibility_group_members")
    .upsert({ group_id: groupBId, user_id: assistantMember.user_id }, { onConflict: "group_id,user_id" });
});

test.afterAll(async () => {
  for (const id of createdJobIds) {
    await adminClient().from("job_visibility_groups").delete().eq("job_id", id);
    await adminClient().from("jobs").delete().eq("job_id", id);
  }
  if (groupBId) await adminClient().from("visibility_groups").delete().eq("group_id", groupBId);
});

test.beforeEach(async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
});

test("JOB-201 เลือก visibility group แล้วสร้างงานสำเร็จ -> เฉพาะสมาชิกกลุ่มนั้น (+owner/manager) เห็นงานนี้", async ({
  page,
}) => {
  const marker = `QA-JOB-201-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await toggleVisibilityGroup(page, "QA Test Group A");
  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: linkRows } = await adminClient()
    .from("job_visibility_groups")
    .select("group_id")
    .eq("job_id", jobId);
  expect(linkRows).toEqual([{ group_id: groupAId }]);

  // supervisor (สมาชิกกลุ่ม A) ต้องเห็นงานนี้ผ่าน RLS
  const { client: supervisorClient } = await signInStaff(
    accounts.supervisor.username,
    accounts.supervisor.pin
  );
  const { data: seenBySupervisor } = await supervisorClient
    .from("jobs")
    .select("job_id")
    .eq("job_id", jobId);
  expect(seenBySupervisor).toHaveLength(1);

  // technician (ไม่ใช่สมาชิกกลุ่มไหนเลย) ต้อง "ไม่เห็น" งานนี้
  const { client: technicianClient } = await signInStaff(
    accounts.technician.username,
    accounts.technician.pin
  );
  const { data: seenByTechnician } = await technicianClient
    .from("jobs")
    .select("job_id")
    .eq("job_id", jobId);
  expect(seenByTechnician).toEqual([]);

  // manager ต้องเห็นเสมอไม่ว่าจะอยู่กลุ่มไหน (can_view_job: is_shop_member(...['owner','manager']))
  const { client: managerClient } = await signInEmail(accounts.manager.email, accounts.manager.password);
  const { data: seenByManager } = await managerClient.from("jobs").select("job_id").eq("job_id", jobId);
  expect(seenByManager).toHaveLength(1);
});

test("JOB-204 ไม่เลือก visibility group เลย -> ทุกคนในอู่เห็นงานนี้ได้ (ค่า default ที่ตั้งใจ)", async ({
  page,
}) => {
  const marker = `QA-JOB-204-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: linkRows } = await adminClient()
    .from("job_visibility_groups")
    .select("group_id")
    .eq("job_id", jobId);
  expect(linkRows).toEqual([]);

  const { client: technicianClient } = await signInStaff(
    accounts.technician.username,
    accounts.technician.pin
  );
  const { data: seenByTechnician } = await technicianClient
    .from("jobs")
    .select("job_id")
    .eq("job_id", jobId);
  expect(seenByTechnician).toHaveLength(1); // เห็นได้ เพราะไม่มีกลุ่มผูกไว้เลย
});

test("JOB-205 เลือก 2 กลุ่มพร้อมกัน -> สมาชิกกลุ่มใดกลุ่มหนึ่ง (OR logic) เห็นงานได้ทั้งคู่", async ({
  page,
}) => {
  const marker = `QA-JOB-205-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await toggleVisibilityGroup(page, "QA Test Group A"); // สมาชิก: supervisor
  await toggleVisibilityGroup(page, "QA Test Group B"); // สมาชิก: assistant
  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: linkRows } = await adminClient()
    .from("job_visibility_groups")
    .select("group_id")
    .eq("job_id", jobId);
  expect(linkRows).toHaveLength(2);

  for (const [label, username, pin] of [
    ["supervisor (กลุ่ม A)", accounts.supervisor.username, accounts.supervisor.pin],
    ["assistant (กลุ่ม B)", accounts.assistant.username, accounts.assistant.pin],
  ]) {
    const { client } = await signInStaff(username, pin);
    const { data } = await client.from("jobs").select("job_id").eq("job_id", jobId);
    expect(data, `${label} ควรเห็นงานนี้ได้`).toHaveLength(1);
  }

  // technician ไม่ได้อยู่กลุ่มไหนเลยในสองกลุ่มนี้ -> ไม่เห็น
  const { client: technicianClient } = await signInStaff(
    accounts.technician.username,
    accounts.technician.pin
  );
  const { data: seenByTechnician } = await technicianClient
    .from("jobs")
    .select("job_id")
    .eq("job_id", jobId);
  expect(seenByTechnician).toEqual([]);
});

test.describe("🔴 JOB-202/203 — Non-atomic insert: job_visibility_groups fail หลัง jobs insert สำเร็จ", () => {
  test("JOB-202 job ถูกสร้างและ 'เห็นได้ทุกคน' ทันทีที่ insert กลุ่มล้มเหลว แม้ผู้ใช้เลือกกลุ่มไว้ก็ตาม", async ({
    page,
  }) => {
    const marker = `QA-JOB-202-${Date.now()}`;

    // บังคับให้ request insert ไปที่ job_visibility_groups ล้มเหลว (abort) โดยไม่แตะ /jobs endpoint
    await page.route("**/rest/v1/job_visibility_groups*", (route) => route.abort("failed"));

    await fillBasicJobForm(page, { customerName: marker });
    await toggleVisibilityGroup(page, "QA Test Group A");
    await submitJobForm(page);

    // ผู้ใช้เห็น error ทั่วไป ทำให้เข้าใจผิดว่า "ทั้งหมดไม่ถูกบันทึก"
    await expectJobSaveFailed(page);

    // แต่ตรวจสอบ DB ตรงพบว่า jobs row ถูกสร้างไปแล้วจริง (customer_name ตรงกับ marker)
    const { data: leakedJob } = await adminClient()
      .from("jobs")
      .select("job_id")
      .eq("shop_id", mainShopId)
      .eq("customer_name", marker)
      .single();
    expect(leakedJob, "jobs row ควรถูกสร้างไปแล้วจริงแม้ UI บอกว่า 'บันทึกไม่สำเร็จ'").toBeTruthy();
    createdJobIds.push(leakedJob.job_id);

    // ไม่มีแถวใน job_visibility_groups เลย = งานนี้เห็นได้ทุกคนในอู่ทันที ทั้งที่ตั้งใจจำกัดกลุ่ม
    const { data: linkRows } = await adminClient()
      .from("job_visibility_groups")
      .select("group_id")
      .eq("job_id", leakedJob.job_id);
    expect(linkRows).toEqual([]);

    const { client: technicianClient } = await signInStaff(
      accounts.technician.username,
      accounts.technician.pin
    );
    const { data: seenByTechnician } = await technicianClient
      .from("jobs")
      .select("job_id")
      .eq("job_id", leakedJob.job_id);
    expect(
      seenByTechnician,
      "🔴 technician (ไม่ได้อยู่กลุ่มไหนที่ผู้ใช้ตั้งใจเลือก) เห็นงานนี้ได้ทั้งที่ไม่ควร — ยืนยันช่องโหว่จริง"
    ).toHaveLength(1);
  });

  test("JOB-203 กด submit ซ้ำหลังเจอ error จาก JOB-202 -> เกิดงานซ้ำ (duplicate job) สำหรับลูกค้าคนเดียวกัน", async ({
    page,
  }) => {
    const marker = `QA-JOB-203-${Date.now()}`;

    await page.route("**/rest/v1/job_visibility_groups*", (route) => route.abort("failed"));
    await fillBasicJobForm(page, { customerName: marker });
    await toggleVisibilityGroup(page, "QA Test Group A");
    await submitJobForm(page);
    await expectJobSaveFailed(page);

    // เอา route intercept ออก แล้วจำลองผู้ใช้ที่ไม่รู้ว่างานถูกสร้างไปแล้ว กด submit ซ้ำ
    await page.unroute("**/rest/v1/job_visibility_groups*");
    await submitJobForm(page);
    const jobId2 = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId2);

    const { data: allJobsForMarker } = await adminClient()
      .from("jobs")
      .select("job_id")
      .eq("shop_id", mainShopId)
      .eq("customer_name", marker);

    createdJobIds.push(...allJobsForMarker.map((j) => j.job_id));
    expect(
      allJobsForMarker.length,
      "🔴 ควรมี 2 งานซ้ำกันสำหรับลูกค้าคนเดียวกัน — ยืนยัน duplicate-job risk จริง"
    ).toBe(2);
  });
});
