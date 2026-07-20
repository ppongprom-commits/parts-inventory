import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import {
  fillBasicJobForm,
  submitJobForm,
  expectJobSavedSuccessfully,
} from "../fixtures/job-helpers.js";
import { adminClient, getShopIdByName, signInEmail } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

let mainShopId;
const createdJobIds = [];
const createdCustomerPhones = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");
});

test.afterAll(async () => {
  for (const id of createdJobIds) {
    await adminClient().from("jobs").delete().eq("job_id", id);
  }
  for (const phone of createdCustomerPhones) {
    await adminClient().from("customers").delete().eq("shop_id", mainShopId).eq("phone", phone);
  }
});

test.beforeEach(async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
});

test.describe("JOB-001-004 — Happy path & minimal-field creation", () => {
  test("JOB-001 สร้างงานด้วยข้อมูลครบทุกช่องพื้นฐาน", async ({ page }) => {
    const phone = `08${Date.now()}`.slice(0, 10);
    await fillBasicJobForm(page, {
      customerName: "QA Test Customer",
      customerPhone: phone,
      customerAddress: "123 ถ.ทดสอบ กรุงเทพฯ",
      licensePlate: "กข 1234 กรุงเทพฯ",
      carBrand: "Nissan",
      carModel: "March",
      sourceType: "รถชน",
      notes: "รอยบุบข้างซ้าย",
    });
    await submitJobForm(page);
    const jobId = await expectJobSavedSuccessfully(page);
    expect(jobId).toBeTruthy();
    createdJobIds.push(jobId);
    createdCustomerPhones.push(phone);

    const { data: job } = await adminClient().from("jobs").select("*").eq("job_id", jobId).single();
    expect(job.customer_name).toBe("QA Test Customer");
    expect(job.car_brand).toBe("Nissan");
    expect(job.status).toBe("received");
  });

  test("JOB-002 สร้างงานโดยไม่กรอกอะไรเลยสักช่อง (ไม่มี field required เลย)", async ({ page }) => {
    await page.goto("/jobs/new");
    await submitJobForm(page);
    const jobId = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId);

    const { data: job } = await adminClient().from("jobs").select("*").eq("job_id", jobId).single();
    expect(job.customer_name).toBeNull();
    expect(job.customer_phone).toBeNull();
    expect(job.car_brand).toBeNull();
    expect(job.photo_urls).toEqual([]);
    expect(job.status).toBe("received");
  });

  test("JOB-004 สถานะเริ่มต้นของงานใหม่ต้องเป็น 'received' เสมอ ไม่มีช่องให้เลือกตอนสร้าง", async ({
    page,
  }) => {
    await page.goto("/jobs/new");
    await expect(page.getByLabel(/สถานะ/)).toHaveCount(0);
  });
});

test.describe("JOB-101-103 — Customer linkage & dedup ตาม unique(shop_id, phone)", () => {
  test("JOB-101 สร้างงานที่ 2 ด้วยเบอร์เดิม ต้อง reuse customer_id เดิม แต่ไม่อัปเดตชื่อ/ที่อยู่เดิม", async ({
    page,
  }) => {
    const phone = `09${Date.now()}`.slice(0, 10);
    createdCustomerPhones.push(phone);

    await fillBasicJobForm(page, { customerName: "ชื่อแรก", customerPhone: phone });
    await submitJobForm(page);
    const jobId1 = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId1);

    const { data: job1 } = await adminClient()
      .from("jobs")
      .select("customer_id")
      .eq("job_id", jobId1)
      .single();
    const customerId = job1.customer_id;
    expect(customerId).toBeTruthy();

    await fillBasicJobForm(page, { customerName: "ชื่อที่สอง (ต่างจากเดิม)", customerPhone: phone });
    await submitJobForm(page);
    const jobId2 = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId2);

    const { data: job2 } = await adminClient()
      .from("jobs")
      .select("customer_id")
      .eq("job_id", jobId2)
      .single();
    expect(job2.customer_id).toBe(customerId);

    const { data: customerRow } = await adminClient()
      .from("customers")
      .select("name")
      .eq("customer_id", customerId)
      .single();
    expect(customerRow.name).toBe("ชื่อแรก");
  });

  test("JOB-103 สร้างงานโดยกรอกแค่ชื่อ ไม่กรอกเบอร์โทร -> ไม่มีการสร้าง/ผูก customer เลย", async ({
    page,
  }) => {
    await fillBasicJobForm(page, { customerName: "ลูกค้าไม่มีเบอร์" });
    await submitJobForm(page);
    const jobId = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId);

    const { data: job } = await adminClient()
      .from("jobs")
      .select("customer_id, customer_name")
      .eq("job_id", jobId)
      .single();
    expect(job.customer_id).toBeNull();
    expect(job.customer_name).toBe("ลูกค้าไม่มีเบอร์");
  });

  test("JOB-102 race condition: 2 insert พร้อมกันด้วยเบอร์ใหม่เบอร์เดียวกัน -> ตัวหนึ่งชน unique(shop_id, phone) แน่นอน", async () => {
    // จำลอง flow ของแอปตรงๆ (select-then-insert แบบไม่ atomic) ด้วย 2 request พร้อมกัน
    // ผ่าน owner client เดียวกัน (ไม่ต้องพึ่ง browser 2 แท็บให้ timing แม่นเป๊ะ — ยิง DB ตรงเชื่อถือได้กว่า)
    const phone = `07${Date.now()}`.slice(0, 10);
    createdCustomerPhones.push(phone);

    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);

    const attempt = () =>
      client.from("customers").insert({ shop_id: mainShopId, name: "Race Test", phone }).select();

    const [resultA, resultB] = await Promise.all([attempt(), attempt()]);
    const errors = [resultA.error, resultB.error].filter(Boolean);
    const successes = [resultA, resultB].filter((r) => !r.error);

    expect(successes).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/duplicate key|unique/i);
  });
});

test.describe("JOB-402 — Car autocomplete generation capture", () => {
  test("พิมพ์ car_brand เองด้วยมือ (ไม่ผ่าน autocomplete) -> car_year_display/generation_id ต้องเป็น null", async ({
    page,
  }) => {
    await fillBasicJobForm(page, { carBrand: "Toyota", carModel: "Vios" });
    await submitJobForm(page);
    const jobId = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId);

    const { data: job } = await adminClient()
      .from("jobs")
      .select("car_year_display, generation_id")
      .eq("job_id", jobId)
      .single();
    expect(job.car_year_display).toBeNull();
    expect(job.generation_id).toBeNull();
  });
});

test.describe("JOB-701 — UI/UX: ปุ่ม submit disable ระหว่างบันทึก", () => {
  test("ปุ่ม 'รับงานเข้าอู่' disable + เปลี่ยนข้อความระหว่างรอ response", async ({ page }) => {
    await page.route("**/rest/v1/jobs*", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });

    await fillBasicJobForm(page, { customerName: "QA button-disable test" });
    const button = page.getByRole("button", { name: /รับงานเข้าอู่/ });
    await button.click();

    await expect(button).toBeDisabled();
    await expect(button).toHaveText("กำลังบันทึก...");

    const jobId = await expectJobSavedSuccessfully(page);
    createdJobIds.push(jobId);
  });
});
