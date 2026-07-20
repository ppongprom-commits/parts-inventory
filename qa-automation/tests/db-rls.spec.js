import { test, expect } from "@playwright/test";
import { signInEmail, signInStaff, adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

// ------------------------------------------------------------
// TC-206: ตรวจ RLS policy ตรงที่ระดับ Postgres โดยใช้ publishable key เดียวกับที่
// แอปจริงใช้ (ไม่ผ่าน browser/UI เลย) ตาม policy จริงใน db/fresh_project_full_schema.sql:
//   zones/options   : SELECT ทุก role ในอู่ / INSERT-UPDATE-DELETE เฉพาะ owner+manager
//   jobs            : SELECT ทุก role / INSERT ทุก role (ถ้า is_shop_active) /
//                      UPDATE เฉพาะ owner-manager-supervisor-technician (ไม่รวม assistant) /
//                      DELETE เฉพาะ owner+manager
//   platform_admins : ไม่มี policy เลย -> เข้าถึงไม่ได้แม้แต่ owner ของอู่ตัวเอง
// ไม่ใช้ Playwright "page" เลยในไฟล์นี้ เพราะทดสอบ DB โดยตรง ไม่เกี่ยวกับ browser/UI
// ------------------------------------------------------------

let mainShopId;
let foreignShopId; // shop ของ ownerPlatformAdmin — ใช้เป็น "อู่คนอื่น" สำหรับเช็ค cross-tenant
let testZoneId;
let testJobId;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");
  foreignShopId = await getShopIdByName("QA Platform-Admin Owner Shop (auto)");
});

test.afterAll(async () => {
  // เก็บกวาดแถวทดสอบที่สร้างไว้ระหว่างรัน (ถ้ายังเหลือ เพราะบาง test อาจ fail ก่อนถึงบรรทัดลบ)
  if (testZoneId) await adminClient().from("zones").delete().eq("id", testZoneId);
  if (testJobId) await adminClient().from("jobs").delete().eq("job_id", testJobId);
});

test.describe("TC-206 — RLS: cross-tenant isolation", () => {
  test("TC-206a technician ของอู่หลัก SELECT zones ของอู่อื่น ต้องได้ผลลัพธ์ว่างเปล่า (ไม่ error, แค่ไม่เห็น)", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data, error } = await client.from("zones").select("*").eq("shop_id", foreignShopId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("TC-206b technician ของอู่หลัก SELECT shop_members ของอู่อื่น ต้องว่างเปล่าเช่นกัน", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data, error } = await client
      .from("shop_members")
      .select("*")
      .eq("shop_id", foreignShopId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("TC-206c ไม่มีใครอ่าน platform_admins ผ่าน publishable key ได้เลย แม้แต่ owner ของอู่ตัวเอง (ไม่มี policy ใดๆ ตั้งใจ)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { data, error } = await client.from("platform_admins").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

test.describe("TC-206 — RLS: zones/options (managers+ only ตาม policy จริง)", () => {
  test("TC-206d technician INSERT zone ใหม่ในอู่ตัวเอง ต้องถูกปฏิเสธ", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { error } = await client
      .from("zones")
      .insert({ shop_id: mainShopId, code: "QA-RLS-TEST", name: "RLS test zone" });
    expect(error).not.toBeNull();
  });

  test("TC-206e manager INSERT zone ใหม่ในอู่ตัวเอง ต้องสำเร็จ (positive control)", async () => {
    const { client } = await signInEmail(accounts.manager.email, accounts.manager.password);
    const { data, error } = await client
      .from("zones")
      .insert({ shop_id: mainShopId, code: "QA-RLS-TEST", name: "RLS test zone" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    testZoneId = data.id;
  });
});

test.describe("TC-206 — RLS: jobs UPDATE/DELETE ตาม role (assistant อัปเดตงานไม่ได้)", () => {
  test.beforeAll(async () => {
    const { data, error } = await adminClient()
      .from("jobs")
      .insert({ shop_id: mainShopId, customer_name: "RLS Test Job", status: "received" })
      .select("job_id")
      .single();
    if (error) throw error;
    testJobId = data.job_id;
  });

  test("TC-206f assistant UPDATE status ของ job ต้องถูกปฏิเสธ (ไม่อยู่ใน update policy)", async () => {
    const { client } = await signInStaff(accounts.assistant.username, accounts.assistant.pin);
    const { data, error } = await client
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("job_id", testJobId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: check } = await adminClient()
      .from("jobs")
      .select("status")
      .eq("job_id", testJobId)
      .single();
    expect(check.status).toBe("received");
  });

  test("TC-206g technician UPDATE status ของ job ต้องสำเร็จ (positive control — technician อยู่ใน update policy)", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data, error } = await client
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("job_id", testJobId)
      .select();
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe("in_progress");
  });

  test("TC-206h technician DELETE job ต้องถูกปฏิเสธ (delete policy = owner/manager เท่านั้น)", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data, error } = await client.from("jobs").delete().eq("job_id", testJobId).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillExists } = await adminClient()
      .from("jobs")
      .select("job_id")
      .eq("job_id", testJobId)
      .maybeSingle();
    expect(stillExists).not.toBeNull();
  });

  test("TC-206i owner DELETE job ต้องสำเร็จ (positive control)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await client.from("jobs").delete().eq("job_id", testJobId);
    expect(error).toBeNull();

    const { data: stillExists } = await adminClient()
      .from("jobs")
      .select("job_id")
      .eq("job_id", testJobId)
      .maybeSingle();
    expect(stillExists).toBeNull();
    testJobId = null;
  });
});
