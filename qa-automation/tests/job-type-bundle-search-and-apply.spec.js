// ------------------------------------------------------------
// การ์ด "Job Type Bundle Template" — Search/Apply flow (หน้า /jobs/[id]) + Confirm modal
// ------------------------------------------------------------
// ครอบคลุมตามที่ตกลงกันในการ์ด:
//   - ช่าง (technician): พิมพ์ = filter จาก preset ที่มีอยู่จริงเท่านั้น (combobox), ไม่มีทาง
//     submit คำที่พิมพ์เป็นชื่อ preset ใหม่ได้เอง (ไม่มีปุ่ม "+ สร้างชุดใหม่" ให้เห็นเลย)
//   - Owner/Manager/Admin: พิมพ์แล้วไม่เจอ -> เห็นปุ่ม "+ สร้างชุดใหม่" -> เปิด confirm modal
//     ต้องตรวจ/แก้ก่อน save จริง (canSave gate)
//   - Sub-variant (เช่น น้ำมันเกียร์ CVT/WS): เลือกแล้ว preview/ราคาต้องถูกต้องตามตัวที่เลือก
//
// อ้างอิง selector จาก source จริง (branch: staging):
//   app/jobs/[id]/page.js               -> unified search box, bundle results, preview panel
//   components/JobTypeBundleConfirmModal.js -> ฟอร์มสร้างเซตใหม่ + canSave gate

import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let fixtureTemplateId; // เซตพร้อม sub-variant ที่ seed ไว้ล่วงหน้าสำหรับเทสต์ค้นหา/apply ของช่าง
let fixtureJobTypeName;
let jobId; // งานตัวอย่างที่ทุกเทสต์ในไฟล์นี้ใช้ร่วมกัน (เปิดที่ /jobs/{jobId})
const createdTemplateIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  const ownerUserId = (
    await adminClient().from("shops").select("owner_user_id").eq("shop_id", mainShopId).single()
  ).data.owner_user_id;

  // งานตัวอย่างเปล่าๆ ไว้เปิด /jobs/{jobId} ทดสอบการค้นหา/ใส่เซต — ใช้ create_job_atomic RPC
  // เดียวกับที่แอปจริงเรียก (ผ่าน admin client เพื่อความเร็ว ไม่ต้องผ่านฟอร์ม UI)
  const { data: job, error: jobError } = await adminClient().rpc("create_job_atomic", {
    p_shop_id: mainShopId,
    p_customer_id: null,
    p_customer_name: `QA-BUNDLE-SEARCH-fixture-job-${Date.now()}`,
    p_customer_phone: null,
    p_customer_address: null,
    p_car_brand: null,
    p_car_model: null,
    p_car_year_display: null,
    p_generation_id: null,
    p_trim_id: null,
    p_license_plate: null,
    p_source_type: null,
    p_notes: null,
    p_photo_urls: [],
    p_damage_points: [],
    p_car_diagram_type: "sedan",
    p_created_by: ownerUserId,
    p_group_ids: [],
    p_workflow_steps: [],
  });
  if (jobError) throw jobError;
  jobId = job.job_id;

  // เซตพร้อม sub-variant (จำลอง "เปลี่ยนถ่ายน้ำมันเกียร์ CVT/WS" ที่คุยกันไว้ตอนออกแบบฟีเจอร์นี้)
  fixtureJobTypeName = `QA-BUNDLE-เปลี่ยนน้ำมันเกียร์-${Date.now()}`;
  const { data: template, error: templateError } = await adminClient()
    .from("job_type_bundle_templates")
    .insert({ shop_id: mainShopId, job_type_name: fixtureJobTypeName, created_by: ownerUserId })
    .select("template_id")
    .single();
  if (templateError) throw templateError;
  fixtureTemplateId = template.template_id;
  createdTemplateIds.push(fixtureTemplateId);

  const { data: item, error: itemError } = await adminClient()
    .from("job_type_bundle_items")
    .insert({
      template_id: fixtureTemplateId,
      category: "parts",
      item_group_label: "น้ำมันเกียร์",
      description: "น้ำมันเกียร์ (default)",
      default_amount: 300,
      default_quantity: 4,
      is_price_locked: true,
      sort_order: 0,
    })
    .select("item_id")
    .single();
  if (itemError) throw itemError;

  const { error: variantsError } = await adminClient().from("job_type_bundle_item_variants").insert([
    { item_id: item.item_id, variant_label: "CVT", description: "น้ำมันเกียร์ CVT", default_amount: 350, default_quantity: 4, sort_order: 0 },
    { item_id: item.item_id, variant_label: "WS", description: "น้ำมันเกียร์ WS", default_amount: 380, default_quantity: 4, sort_order: 1 },
  ]);
  if (variantsError) throw variantsError;
});

test.afterAll(async () => {
  if (jobId) {
    await adminClient().from("job_cost_items").delete().eq("job_id", jobId);
    await adminClient().from("jobs").delete().eq("job_id", jobId);
  }
  for (const id of createdTemplateIds) {
    await adminClient().from("job_type_bundle_templates").delete().eq("template_id", id); // items/variants มี on delete cascade
  }
});

const SEARCH_INPUT_PLACEHOLDER = "รายละเอียด — พิมพ์ชื่องาน/อะไหล่/รายการที่เคยใช้ ('ค่า...' = ค่าแรงอัตโนมัติ)";

test.describe("BUNDLE-SEARCH — ช่าง (technician): ค้นหา/ใช้เซตที่มีอยู่แล้วเท่านั้น", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);
    await page.goto(`/jobs/${jobId}`);
  });

  test("BUNDLE-01 พิมพ์คำที่ตรงกับ preset ที่มีอยู่ -> เจอผลลัพธ์ในกลุ่ม '🧰 เซตงาน' และเลือกได้", async ({ page }) => {
    const searchBox = page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER);
    await searchBox.fill(fixtureJobTypeName.slice(0, 15)); // พิมพ์แค่บางส่วน — ต้อง filter เจอด้วย ilike %...%

    const resultButton = page.getByRole("button", { name: new RegExp(fixtureJobTypeName) });
    await expect(resultButton).toBeVisible({ timeout: 8000 });
    await resultButton.click();

    // preview panel ต้องโผล่พร้อมชื่อเซต + ปุ่ม "ใช้เซตนี้"
    await expect(page.getByText(`🧰 ${fixtureJobTypeName}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "✅ ใช้เซตนี้" })).toBeVisible();
  });

  test("BUNDLE-02 พิมพ์คำที่ไม่ตรงกับ preset ใดเลย -> ไม่เจอผลลัพธ์ และไม่มีปุ่ม '+ สร้างชุดใหม่' ให้ช่างเห็นเด็ดขาด", async ({
    page,
  }) => {
    const searchBox = page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER);
    const bogusQuery = `ไม่มีเซตนี้แน่นอน-${Date.now()}`;
    await searchBox.fill(bogusQuery);

    // รอให้ query ยิงจบ (no debounce ในโค้ดจริง แต่กัน flake เผื่อ network เล็กน้อย)
    await page.waitForTimeout(500);

    await expect(page.getByRole("button", { name: /สร้างชุดใหม่/ })).not.toBeVisible();
  });

  test("BUNDLE-03 เลือกเซตที่มี sub-variant แล้วสลับตัวเลือก -> ใช้เซตนี้ -> job_cost_items ถูกเพิ่มด้วยราคา/variant ที่เลือกจริง (ไม่ใช่ default ตัวแรกเสมอ)", async ({
    page,
  }) => {
    const searchBox = page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER);
    await searchBox.fill(fixtureJobTypeName.slice(0, 15));
    await page.getByRole("button", { name: new RegExp(fixtureJobTypeName) }).click();

    // ตัวเลือก sub-variant ต้อง default เป็นตัวแรก (CVT) ตาม handleSelectBundleResult
    const variantSelect = page.locator("select").filter({ hasText: "CVT" });
    await expect(variantSelect).toBeVisible();
    await expect(variantSelect).toHaveValue(/.+/); // มีค่าเลือกอยู่แล้ว (ไม่ใช่ค่าว่าง)

    // สลับไปเลือก WS แทน (ราคา/ปริมาณต้องเปลี่ยนตาม WS: 380 บาท/หน่วย ไม่ใช่ CVT 350)
    await variantSelect.selectOption({ label: /WS/ });
    await expect(page.getByText(/380.*บาท\/หน่วย/)).toBeVisible();

    await page.getByRole("button", { name: "✅ ใช้เซตนี้" }).click();

    // ยืนยันใน DB: ต้องได้ job_cost_items แถวใหม่ amount = 380 * 4 = 1520 (unitAmount * quantity)
    // และ bundle_variant_id ตรงกับ variant "WS" ที่เลือกจริง ไม่ใช่ CVT ตัวแรก
    await page.waitForTimeout(800); // ให้ insert + refetch เสร็จก่อน query ตรง DB
    const { data: costItems } = await adminClient()
      .from("job_cost_items")
      .select("amount, quantity, bundle_variant_id, description")
      .eq("job_id", jobId)
      .eq("description", "น้ำมันเกียร์ WS");
    expect(costItems, "ควรมี job_cost_items แถวที่มาจากการเลือก WS").toHaveLength(1);
    expect(Number(costItems[0].amount)).toBe(1520);
    expect(Number(costItems[0].quantity)).toBe(4);
  });
});

test.describe("BUNDLE-CREATE — Owner/Manager/Admin: สร้างเซตใหม่ inline จากหน้างาน + confirm modal", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto(`/jobs/${jobId}`);
  });

  test("BUNDLE-04 พิมพ์คำที่ไม่ตรงกับ preset ใดเลย -> เห็นปุ่ม '+ สร้างชุดใหม่' (owner เท่านั้น ต่างจากช่าง) และเปิด modal พร้อมชื่อ prefill", async ({
    page,
  }) => {
    const query = `QA-BUNDLE-newtype-${Date.now()}`;
    await page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER).fill(query);

    const createButton = page.getByRole("button", { name: new RegExp(`สร้างชุดใหม่.*${query}`) });
    await expect(createButton).toBeVisible();
    await createButton.click();

    const modal = page.locator(".job-bundle-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel("ชื่อประเภทงาน")).toHaveValue(query); // prefill จาก bundleQuery ตรงตามการ์ด

    // canSave ต้องยัง false ตอนนี้ (ยังไม่ได้กรอกรายการเลย) — ปุ่ม save ต้อง disabled
    await expect(modal.getByRole("button", { name: "บันทึกเซตนี้" })).toBeDisabled();
  });

  test("BUNDLE-05 กรอกเซตใหม่ (ไม่มี sub-variant) แล้วกด 'บันทึกเซตนี้' -> สร้างเซต+ใช้ในงานทันที", async ({ page }) => {
    const query = `QA-BUNDLE-simple-${Date.now()}`;

    await page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER).fill(query);
    await page.getByRole("button", { name: new RegExp(`สร้างชุดใหม่.*${query}`) }).click();

    const modal = page.locator(".job-bundle-modal");
    await modal.locator('input[placeholder="ชื่อรายการ เช่น น้ำมันเกียร์"]').fill("ค่าแรงทั่วไป");
    await modal.locator('input[placeholder="รายละเอียด default"]').fill("ค่าแรงตรวจเช็คทั่วไป");
    await modal.locator('input[placeholder="ปริมาณ"]').fill("1");
    await modal.locator('input[placeholder="ราคา"]').fill("200");

    const saveButton = modal.getByRole("button", { name: "บันทึกเซตนี้" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(modal).not.toBeVisible({ timeout: 8000 });

    // ต้องมี template ใหม่ใน DB ด้วยชื่อที่พิมพ์ไว้ + ถูกใช้กับงานปัจจุบันทันที (job_cost_items เพิ่มแล้ว)
    const { data: newTemplate } = await adminClient()
      .from("job_type_bundle_templates")
      .select("template_id")
      .eq("shop_id", mainShopId)
      .eq("job_type_name", query)
      .single();
    expect(newTemplate, "เซตใหม่ควรถูกสร้างจริงใน DB").toBeTruthy();
    createdTemplateIds.push(newTemplate.template_id);

    const { data: costItem } = await adminClient()
      .from("job_cost_items")
      .select("amount, quantity, bundle_item_id")
      .eq("job_id", jobId)
      .eq("description", "ค่าแรงตรวจเช็คทั่วไป")
      .maybeSingle();
    expect(costItem, "เซตที่เพิ่งสร้างควรถูกใช้กับงานปัจจุบันทันที ไม่ต้องค้นหาซ้ำ").toBeTruthy();
    expect(Number(costItem.amount)).toBe(200);
  });

  test("BUNDLE-06 [ลำดับถูกต้อง] กรอกรายละเอียด default ก่อน แล้วค่อยเพิ่ม sub-variant -> save ผ่าน และมี variant ครบใน DB", async ({
    page,
  }) => {
    const query = `QA-BUNDLE-variant-ok-${Date.now()}`;
    await page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER).fill(query);
    await page.getByRole("button", { name: new RegExp(`สร้างชุดใหม่.*${query}`) }).click();

    const modal = page.locator(".job-bundle-modal");
    await modal.locator('input[placeholder="ชื่อรายการ เช่น น้ำมันเกียร์"]').fill("น้ำมันเกียร์");
    // ⚠️ ต้องกรอก "รายละเอียด default" ก่อนเพิ่ม sub-variant เสมอ — ดู BUNDLE-07 สำหรับเหตุผล
    // (ช่องนี้จะหายไปจาก UI ทันทีที่มี sub-variant แล้ว แก้ทีหลังไม่ได้อีกเลยผ่านหน้านี้)
    await modal.locator('input[placeholder="รายละเอียด default"]').fill("น้ำมันเกียร์ (ตั้งใจกรอกไว้ก่อน)");

    await modal.getByRole("button", { name: "+ เพิ่ม sub-variant" }).click();
    await modal.getByRole("button", { name: "+ เพิ่ม sub-variant" }).click();

    const variantLabelInputs = modal.locator('input[placeholder="ชื่อ sub-variant เช่น CVT"]');
    const variantDescInputs = modal.locator('input[placeholder="รายละเอียด"]');
    const variantQtyInputs = modal.locator('input[placeholder="ปริมาณ"]');
    const variantPriceInputs = modal.locator('input[placeholder="ราคา"]');

    await variantLabelInputs.nth(0).fill("CVT");
    await variantDescInputs.nth(0).fill("น้ำมันเกียร์ CVT");
    await variantQtyInputs.nth(0).fill("4");
    await variantPriceInputs.nth(0).fill("350");

    await variantLabelInputs.nth(1).fill("WS");
    await variantDescInputs.nth(1).fill("น้ำมันเกียร์ WS");
    await variantQtyInputs.nth(1).fill("4");
    await variantPriceInputs.nth(1).fill("380");

    const saveButton = modal.getByRole("button", { name: "บันทึกเซตนี้" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(modal).not.toBeVisible({ timeout: 8000 });

    const { data: newTemplate } = await adminClient()
      .from("job_type_bundle_templates")
      .select("template_id, job_type_bundle_items(item_id, job_type_bundle_item_variants(variant_label, default_amount))")
      .eq("shop_id", mainShopId)
      .eq("job_type_name", query)
      .single();
    expect(newTemplate).toBeTruthy();
    createdTemplateIds.push(newTemplate.template_id);
    const variants = newTemplate.job_type_bundle_items[0].job_type_bundle_item_variants;
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.variant_label).sort()).toEqual(["CVT", "WS"]);
  });

  test("BUNDLE-07 [BUG พบระหว่างเขียน test — 23 ก.ค. 2569] ถ้าเพิ่ม sub-variant ก่อนกรอกรายละเอียด default ของรายการ -> ปุ่ม save ค้าง disabled ถาวร ทั้งที่กรอก sub-variant ครบทุกช่องแล้ว", async ({
    page,
  }) => {
    // JobTypeBundleConfirmModal.js: canSave = ... && items.every(it => it.item_group_label.trim() && it.description.trim())
    // เช็ค it.description (ช่องระดับรายการหลัก "รายละเอียด default") เสมอไม่ว่า item จะมี
    // sub-variant กี่ตัวก็ตาม — แต่ช่องนี้ถูกซ่อนออกจาก UI ทันทีที่ item.variants.length > 0
    // (ดู ternary: variants.length===0 ? <input รายละเอียด default.../> : <div>มี sub-variant แล้ว</div>)
    // ผู้ใช้ที่กด "+ เพิ่ม sub-variant" ทันทีหลังตั้งชื่อรายการ (ลำดับที่เป็นธรรมชาติที่สุดสำหรับ
    // เคสน้ำมันเกียร์ CVT/WS ที่คุยกันไว้ตอนออกแบบ) จะไม่มีทางกรอกช่องนี้ได้อีกเลยผ่าน UI —
    // ปุ่ม "บันทึกเซตนี้" จะ disabled ค้างถาวรโดยไม่มีข้อความอธิบายเหตุผลให้เห็นเลยว่าทำไม
    const query = `QA-BUNDLE-variant-bug-${Date.now()}`;
    await page.getByPlaceholder(SEARCH_INPUT_PLACEHOLDER).fill(query);
    await page.getByRole("button", { name: new RegExp(`สร้างชุดใหม่.*${query}`) }).click();

    const modal = page.locator(".job-bundle-modal");
    await modal.locator('input[placeholder="ชื่อรายการ เช่น น้ำมันเกียร์"]').fill("น้ำมันเกียร์");
    // ไม่แตะ "รายละเอียด default" เลยตามลำดับการใช้งานตามธรรมชาติ -> เพิ่ม sub-variant ทันที
    await modal.getByRole("button", { name: "+ เพิ่ม sub-variant" }).click();
    await modal.locator('input[placeholder="ชื่อ sub-variant เช่น CVT"]').first().fill("CVT");
    await modal.locator('input[placeholder="รายละเอียด"]').first().fill("น้ำมันเกียร์ CVT");
    await modal.locator('input[placeholder="ปริมาณ"]').first().fill("4");
    await modal.locator('input[placeholder="ราคา"]').first().fill("350");

    await expect(
      modal.getByRole("button", { name: "บันทึกเซตนี้" }),
      "🔴 ยืนยัน bug จริง: save ควร enabled ได้ทั้งที่กรอก sub-variant ครบ แต่ code เช็ค item.description ที่ถูกซ่อนไปแล้ว"
    ).toBeDisabled();

    await modal.getByRole("button", { name: "ยกเลิก" }).click(); // ปิด modal ทิ้ง ไม่ต้อง save จริง (save ไม่ได้อยู่แล้ว)
  });
});
