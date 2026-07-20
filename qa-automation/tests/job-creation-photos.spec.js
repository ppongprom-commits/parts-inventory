import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { fillBasicJobForm, submitJobForm, expectJobSavedSuccessfully } from "../fixtures/job-helpers.js";
import { adminClient } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TINY_PNG = path.join(__dirname, "test-assets", "tiny.png");

const createdJobIds = [];

test.afterAll(async () => {
  for (const id of createdJobIds) {
    await adminClient().from("jobs").delete().eq("job_id", id);
  }
});

test.beforeEach(async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
});

test("JOB-501 สร้างงานโดยไม่แนบรูปเลย (ต่างจาก /add ที่บังคับต้องมีรูป)", async ({ page }) => {
  const marker = `QA-JOB-501-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });
  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: job } = await adminClient().from("jobs").select("photo_urls").eq("job_id", jobId).single();
  expect(job.photo_urls).toEqual([]);
});

test("JOB-502 แนบหลายรูปพร้อมกันจากคลังภาพ (multiple)", async ({ page }) => {
  const marker = `QA-JOB-502-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });

  // input ตัวที่ 2 คือ galleryInputRef (มี multiple attribute) — ตัวแรกคือ cameraInputRef
  const galleryInput = page.locator('input[type="file"][multiple]');
  await galleryInput.setInputFiles([TINY_PNG, TINY_PNG, TINY_PNG]);

  // รอให้ resize/preview เสร็จก่อน (ปุ่มถ่ายรูป/เลือกคลังจะ disable ระหว่างประมวลผล)
  await expect(page.getByRole("button", { name: /กำลังประมวลผล/ })).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator(".photo-thumb")).toHaveCount(3);

  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: job } = await adminClient().from("jobs").select("photo_urls").eq("job_id", jobId).single();
  expect(job.photo_urls).toHaveLength(3);
});

test("JOB-503 ลบรูปออกจากลิสต์ก่อน submit — เหลือแค่รูปที่ไม่ถูกลบเท่านั้นที่อัปโหลดจริง", async ({
  page,
}) => {
  const marker = `QA-JOB-503-${Date.now()}`;
  await fillBasicJobForm(page, { customerName: marker });

  const galleryInput = page.locator('input[type="file"][multiple]');
  await galleryInput.setInputFiles([TINY_PNG, TINY_PNG, TINY_PNG]);
  await expect(page.locator(".photo-thumb")).toHaveCount(3);

  // ลบรูปที่ 2 (index 1) ออก
  await page.locator(".photo-thumb").nth(1).locator(".photo-remove-btn").click();
  await expect(page.locator(".photo-thumb")).toHaveCount(2);

  await submitJobForm(page);
  const jobId = await expectJobSavedSuccessfully(page);
  createdJobIds.push(jobId);

  const { data: job } = await adminClient().from("jobs").select("photo_urls").eq("job_id", jobId).single();
  expect(job.photo_urls).toHaveLength(2);
});
