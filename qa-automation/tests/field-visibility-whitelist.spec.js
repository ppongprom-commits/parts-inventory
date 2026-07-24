// การ์ด "Field Visibility Whitelist กลาง (role × field group) — ตัดสินใจครั้งเดียว ใช้ 4 การ์ด"
//
// ครอบคลุมตาม test scenario ที่การ์ดระบุไว้: loop role × ช่องทาง (API export-csv/reports) assert
// ว่า field ต้องห้ามไม่อยู่ใน response จริง (ไม่ใช่แค่ถูกซ่อนที่ DOM) + owner พยายาม override
// เหนือ floor ต้องถูกปฏิเสธเสมอไม่ว่าจะยิงผ่านช่องทางไหน (รวมถึง direct DB write ที่ไม่ผ่าน
// UI ของหน้า /admin/settings/field-visibility เลย)
import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { getAccessToken, getStoredSessionId } from "../fixtures/api-helpers.js";
import { adminClient, getShopIdByName, signInEmail } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let mainBranchId;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  const { data: branch, error } = await adminClient()
    .from("branches")
    .select("branch_id")
    .eq("shop_id", mainShopId)
    .limit(1)
    .single();
  expect(error).toBeNull();
  mainBranchId = branch.branch_id;
});

// กัน suite นี้ทิ้ง override ค้างไว้ที่กระทบ suite/เทสต์อื่นที่ใช้ shop เดียวกัน — ลบ override
// ทั้งหมดที่แถวนี้สร้างไว้ก่อน/หลัง suite เสมอ
test.afterEach(async () => {
  await adminClient().from("shop_field_visibility_overrides").delete().eq("shop_id", mainShopId);
});

async function callApi(request, baseURL, page, path) {
  const token = await getAccessToken(page);
  const sessionId = await getStoredSessionId(page);
  return request.get(`${baseURL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "x-session-id": sessionId || "" },
  });
}

test.describe("Field Visibility Whitelist — Export CSV channel", () => {
  test("FV-CSV-01 technician เรียก export-csv (parts/jobs/sales) ตรงๆ ต้องโดน 403 ทั้ง 3 endpoint", async ({
    page,
    request,
    baseURL,
  }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);

    for (const endpoint of ["/api/parts/export-csv", "/api/jobs/export-csv", "/api/sales/export-csv"]) {
      const res = await callApi(request, baseURL, page, `${endpoint}?shop_id=${mainShopId}`);
      expect(res.status(), `${endpoint} ควรตอบ 403 ให้ technician`).toBe(403);
    }
  });

  test("FV-CSV-02 owner export-csv jobs เห็น customer_name/customer_phone จริงในเนื้อ CSV", async ({
    page,
    request,
    baseURL,
  }) => {
    // สร้างงานทดสอบที่มีชื่อ/เบอร์ลูกค้าไม่ซ้ำใครเพื่อยืนยันตัวได้ชัดใน CSV
    const marker = `QA-FV-${Date.now()}`;
    const { error: insertError } = await adminClient().from("jobs").insert({
      shop_id: mainShopId,
      branch_id: mainBranchId,
      customer_name: marker,
      customer_phone: "0812345678",
      car_brand: "Test",
      car_model: "Test",
    });
    expect(insertError).toBeNull();

    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);

    const res = await callApi(request, baseURL, page, `/api/jobs/export-csv?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toContain(marker);
    expect(csv).toContain("0812345678");

    await adminClient().from("jobs").delete().eq("customer_name", marker);
  });

  test("FV-CSV-03 supervisor export-csv parts: allocated_cost มีค่า, ปิด override cost_price แล้วต้องเป็นค่าว่าง", async ({
    page,
    request,
    baseURL,
  }) => {
    const marker = `QA-FV-PART-${Date.now()}`;
    const { data: part, error } = await adminClient()
      .from("parts")
      .insert({
        shop_id: mainShopId,
        part_name: marker,
        quantity: 1,
        price: 999,
        allocated_cost: 555,
        item_type: "salvage",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    await loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin);
    await expectLoginSucceeded(page);

    // default: supervisor เห็น cost_price ได้ (✅ default ตามการ์ด)
    let res = await callApi(request, baseURL, page, `/api/parts/export-csv?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);
    let csv = await res.text();
    const rowRegex = new RegExp(`${marker}[^\\n]*`);
    let row = csv.match(rowRegex)?.[0] || "";
    expect(row).toContain("555");

    // Owner override ปิด cost_price ให้ supervisor ในร้านนี้
    const { error: overrideError } = await adminClient().from("shop_field_visibility_overrides").upsert({
      shop_id: mainShopId,
      role: "supervisor",
      field_group: "cost_price",
      allowed: false,
    });
    expect(overrideError).toBeNull();

    res = await callApi(request, baseURL, page, `/api/parts/export-csv?shop_id=${mainShopId}`);
    csv = await res.text();
    row = csv.match(rowRegex)?.[0] || "";
    expect(row).not.toContain("555");

    await adminClient().from("parts").delete().eq("id", part.id);
  });
});

test.describe("Field Visibility Whitelist — Field Scanner customer PII (jobs API channel)", () => {
  test("FV-JOB-01 field_scanner ดึงรายการงาน (/api/jobs) ต้องไม่มี customer_name/customer_phone ในเนื้อ response เลย แม้ owner เห็นได้ปกติ", async ({
    page,
    request,
    baseURL,
  }) => {
    const marker = `QA-FV-JOB-${Date.now()}`;
    const { data: job, error } = await adminClient()
      .from("jobs")
      .insert({
        shop_id: mainShopId,
        branch_id: mainBranchId,
        customer_name: marker,
        customer_phone: "0899998888",
        car_brand: "Test",
        car_model: "Test",
      })
      .select("job_id")
      .single();
    expect(error).toBeNull();

    // owner เห็นได้ปกติ
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    let res = await callApi(request, baseURL, page, `/api/jobs?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);
    let json = await res.json();
    let row = (json.jobs || []).find((j) => j.job_id === job.job_id);
    expect(row).toBeTruthy();
    expect(row.customer_name).toBe(marker);
    expect(row.customer_phone).toBe("0899998888");

    // field_scanner ต้องไม่เห็น customer_name/phone ของงานเดียวกันเลย (floor rule — ห้าม
    // configure สูงกว่านี้ไม่ว่ากรณีใด) — ไม่ใช่แค่ hide ที่ DOM ต้องหายจาก response body จริง
    const staffPage = await page.context().newPage();
    await loginWithStaffPin(staffPage, accounts.fieldScanner.username, accounts.fieldScanner.pin);
    await expectLoginSucceeded(staffPage);
    res = await callApi(request, baseURL, staffPage, `/api/jobs?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);
    json = await res.json();
    row = (json.jobs || []).find((j) => j.job_id === job.job_id);
    expect(row).toBeTruthy();
    expect(row.customer_name).toBeNull();
    expect(row.customer_phone).toBeNull();

    // detail endpoint เดียวกัน
    res = await callApi(request, baseURL, staffPage, `/api/jobs/${job.job_id}?shop_id=${mainShopId}`);
    json = await res.json();
    expect(json.job.customer_name).toBeNull();
    expect(json.job.customer_phone).toBeNull();

    await adminClient().from("jobs").delete().eq("job_id", job.job_id);
  });
});

test.describe("Field Visibility Whitelist — Reports channel", () => {
  test("FV-REP-01 technician เรียก /api/reports/sales ต้องโดน 403 (sales_reports = false default)", async ({
    page,
    request,
    baseURL,
  }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);
    const res = await callApi(request, baseURL, page, `/api/reports/sales?shop_id=${mainShopId}`);
    expect(res.status()).toBe(403);
  });

  test("FV-REP-02 supervisor เรียก /api/reports/sales ได้ default, ปิด override customer_name แล้ว sold_to ต้องเป็น null", async ({
    page,
    request,
    baseURL,
  }) => {
    await loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin);
    await expectLoginSucceeded(page);

    let res = await callApi(request, baseURL, page, `/api/reports/sales?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);

    await adminClient().from("shop_field_visibility_overrides").upsert({
      shop_id: mainShopId,
      role: "supervisor",
      field_group: "customer_name",
      allowed: false,
    });

    res = await callApi(request, baseURL, page, `/api/reports/sales?shop_id=${mainShopId}`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    for (const sale of json.partSales || []) {
      expect(sale.sold_to).toBeNull();
    }
    for (const doc of json.billingDocs || []) {
      expect(doc.snapshot?.customer_name).toBeFalsy();
    }
  });
});

test.describe("Field Visibility Whitelist — Floor rules cannot be overridden via ANY channel", () => {
  test("FV-FLOOR-01 owner พยายาม override field_scanner ให้เห็น customer_name ผ่าน DB ตรงๆ (ข้าม UI ทั้งหมด) ต้องถูกปฏิเสธ", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await ownerClient.from("shop_field_visibility_overrides").insert({
      shop_id: mainShopId,
      role: "field_scanner",
      field_group: "customer_name",
      allowed: true,
    });
    expect(error).toBeTruthy();
  });

  test("FV-FLOOR-02 owner พยายาม override field_scanner ให้เห็น customer_phone ผ่าน DB ตรงๆ ต้องถูกปฏิเสธ", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await ownerClient.from("shop_field_visibility_overrides").insert({
      shop_id: mainShopId,
      role: "field_scanner",
      field_group: "customer_phone",
      allowed: true,
    });
    expect(error).toBeTruthy();
  });

  test("FV-FLOOR-03 owner พยายาม override ให้ technician จัดการ API key ได้ ต้องถูกปฏิเสธ (floor: manage_api_keys สงวน owner/manager เท่านั้น)", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await ownerClient.from("shop_field_visibility_overrides").insert({
      shop_id: mainShopId,
      role: "technician",
      field_group: "manage_api_keys",
      allowed: true,
    });
    expect(error).toBeTruthy();
  });

  test("FV-FLOOR-04 owner พยายาม override ให้ admin จัดการ API key ได้ ต้องถูกปฏิเสธ (floor ไม่เปลี่ยนตาม trust tier — Admin Role card)", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await ownerClient.from("shop_field_visibility_overrides").insert({
      shop_id: mainShopId,
      role: "admin",
      field_group: "manage_api_keys",
      allowed: true,
    });
    expect(error).toBeTruthy();
  });

  test("FV-FLOOR-05 override ที่ไม่ใช่ floor (เช่น อนุญาต technician เห็น sales_reports) ต้องผ่านได้ปกติ — พิสูจน์ว่า trigger บล็อกเฉพาะ floor จริงๆ ไม่ใช่บล็อกทุกอย่าง", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await ownerClient.from("shop_field_visibility_overrides").upsert({
      shop_id: mainShopId,
      role: "technician",
      field_group: "sales_reports",
      allowed: true,
    });
    expect(error).toBeNull();
  });
});

test.describe("Field Visibility Whitelist — /admin/settings/field-visibility UI", () => {
  test("FV-UI-01 owner เห็นตาราง matrix, floor-locked cells (field_scanner ชื่อ/เบอร์ลูกค้า, ทุก role ที่ไม่ใช่ owner/manager สำหรับ API key) ต้อง disabled", async ({
    page,
  }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/settings/field-visibility");

    await expect(page.getByTestId("fv-field_scanner-customer_name")).toBeDisabled();
    await expect(page.getByTestId("fv-field_scanner-customer_phone")).toBeDisabled();
    await expect(page.getByTestId("fv-field_scanner-customer_name")).not.toBeChecked();
    await expect(page.getByTestId("fv-field_scanner-customer_phone")).not.toBeChecked();

    for (const role of ["supervisor", "technician", "assistant", "field_scanner", "admin"]) {
      await expect(page.getByTestId(`fv-${role}-manage_api_keys`)).toBeDisabled();
      await expect(page.getByTestId(`fv-${role}-manage_api_keys`)).not.toBeChecked();
    }

    // ช่องที่ไม่ใช่ floor ต้อง toggle ได้ปกติ (ไม่ disabled)
    await expect(page.getByTestId("fv-supervisor-sales_reports")).toBeEnabled();
  });

  test("FV-UI-02 technician เข้า /admin/settings/field-visibility ไม่ได้ (owner เท่านั้น)", async ({ page }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);
    await page.goto("/admin/settings/field-visibility");
    await expect(page.getByTestId("fv-supervisor-sales_reports")).toHaveCount(0);
  });
});
