// การ์ด "รายงานสรุปสต็อก (Stock Summary Report) — Pro+" (Notion 3a1f39f4564981d1a15ed167dcd8031b)
//
// Reuse: db/stock_summary_report_migration.sql (fn_shop_stock_parts_detail /
// fn_shop_stock_summary_totals / fn_shop_vehicle_remaining_detail /
// fn_shop_salvage_vehicle_summary) + app/api/reports/stock-summary/route.js
//
// ส่วนใหญ่ยิงตรงที่ API ผ่าน request fixture ของ Playwright (ไม่ผ่าน UI) เพื่อความเร็ว/ความนิ่ง
// ของตัวเลข — เหมือน pattern การ seed fixture ตรงผ่าน adminClient (service role) ใน
// unpriced-part-sale-approval.spec.js — ยกเว้น 2 จุดที่ต้อง "เดิน UI จริง" ตามข้อกำหนดงาน:
// tier gate ต้องเทสต์ทั้ง UI-hide และ API 403
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient } from "../fixtures/db-client.js";
import { accounts, supabaseUrl, supabasePublishableKey, getTierShopOwner } from "../fixtures/test-data.js";

const RUN_ID = Date.now();

async function getAccessToken(email, password) {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ล้มเหลว (${email}): ${error.message}`);
  return { token: data.session.access_token, userId: data.user.id };
}

async function fetchReport(request, baseURL, token, shopId, extraParams = "") {
  const res = await request.get(
    `${baseURL}/api/reports/stock-summary?shop_id=${shopId}${extraParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res;
}

async function createShop({ name, plan, ownerUserId }) {
  const { data, error } = await adminClient()
    .from("shops")
    .insert({ shop_name: name, subscription_plan: plan, owner_user_id: ownerUserId })
    .select("shop_id")
    .single();
  if (error) throw new Error(`สร้างร้าน ${name} ไม่สำเร็จ: ${error.message}`);
  const { error: memberError } = await adminClient()
    .from("shop_members")
    .insert({ shop_id: data.shop_id, user_id: ownerUserId, role: "owner", status: "active" });
  if (memberError) throw new Error(`เพิ่ม owner membership ไม่สำเร็จ: ${memberError.message}`);
  return data.shop_id;
}

test.describe("Stock Summary Report — Pro+", () => {
  // การ์ดนี้ทดสอบ invariant ทางการเงินที่ต้องแม่นเป๊ะข้ามหลาย test (มูลค่าสต็อกสะสม, allocated_cost
  // ต่อคันซาก ฯลฯ) — บังคับ serial กันปัญหา fullyParallel (playwright.config.js) รัน beforeAll ซ้ำ
  // คนละ worker แล้วได้ mainShopId ไม่ตรงกันข้าม test ในไฟล์เดียวกัน (ต่างจาก spec ไฟล์อื่นที่ข้อมูล
  // แต่ละ test เป็นอิสระต่อกันจริงๆ ไฟล์นี้ share shop fixture ตลอดทั้งไฟล์ ต้องการความชัวร์มากกว่า)
  test.describe.configure({ mode: "serial" });

  let ownerUserId;
  let ownerToken;
  let mainShopId; // pro tier — invariant / consignment / vehicle-profit fixtures
  let zeroSalvageShopId; // pro tier — no salvage vehicles at all

  const vehicleIds = [];
  const partIds = [];
  const zoneIds = [];
  const saleIds = [];
  const shopIds = [];

  test.beforeAll(async () => {
    const { token, userId } = await getAccessToken(accounts.owner.email, accounts.owner.password);
    ownerToken = token;
    ownerUserId = userId;

    mainShopId = await createShop({ name: `QA StockSummary Main ${RUN_ID}`, plan: "pro", ownerUserId });
    zeroSalvageShopId = await createShop({ name: `QA StockSummary ZeroSalvage ${RUN_ID}`, plan: "pro", ownerUserId });
    shopIds.push(mainShopId, zeroSalvageShopId);
  });

  test.afterAll(async () => {
    for (const id of saleIds) await adminClient().from("part_sales").delete().eq("sale_id", id);
    for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
    for (const id of vehicleIds) await adminClient().from("salvage_vehicles").delete().eq("vehicle_id", id);
    for (const id of zoneIds) await adminClient().from("zones").delete().eq("id", id);
    for (const id of shopIds) {
      await adminClient().from("shop_members").delete().eq("shop_id", id);
      await adminClient().from("shops").delete().eq("shop_id", id);
    }
  });

  test("SSR-001 cross-feature invariant: section 1 (all-owner-types base) ต้องเท่ากับ shops.current_stock_value เป๊ะ", async ({
    request,
    baseURL,
  }) => {
    // fixture ผสม: ซื้อตรง (price) + ถอดจากซาก (allocated_cost) — ไม่มี consignment, ไม่มีซากถอดค้าง
    // (vehicle ปิดสมบูรณ์แล้ว remaining_value=0) เพื่อให้ section1.total ตรงกับ current_stock_value เป๊ะ
    const { data: directPart, error: directErr } = await adminClient()
      .from("parts")
      .insert({ shop_id: mainShopId, part_name: `QA-DIRECT-${RUN_ID}`, price: 5000, quantity: 2, is_active: true })
      .select("id")
      .single();
    expect(directErr).toBeNull();
    partIds.push(directPart.id);

    const { data: vehicle, error: vehicleErr } = await adminClient()
      .from("salvage_vehicles")
      .insert({
        shop_id: mainShopId,
        purchase_price: 20000,
        estimated_total_value: 20000,
        value_groups: [{ label: "QA", estimated_value: 20000 }],
      })
      .select("vehicle_id")
      .single();
    expect(vehicleErr).toBeNull();
    vehicleIds.push(vehicle.vehicle_id);

    const { data: salvagePart, error: salvageErr } = await adminClient()
      .from("parts")
      .insert({
        shop_id: mainShopId,
        part_name: `QA-SALVAGE-${RUN_ID}`,
        quantity: 1,
        is_active: true,
        salvage_vehicle_id: vehicle.vehicle_id,
        estimated_value: 20000, // = estimated_total_value -> allocated_cost คำนวณเป็น 20000 เป๊ะ
      })
      .select("id, allocated_cost")
      .single();
    expect(salvageErr).toBeNull();
    partIds.push(salvagePart.id);
    expect(Number(salvagePart.allocated_cost)).toBe(20000);

    // ปิดคันให้ remaining_value = 0 (เศษเหล็ก = 0 เพราะจัดสรรครบพอดีแล้ว)
    await adminClient().from("salvage_vehicles").update({ status: "fully_disassembled" }).eq("vehicle_id", vehicle.vehicle_id);

    const { data: shopRow } = await adminClient()
      .from("shops")
      .select("current_stock_value")
      .eq("shop_id", mainShopId)
      .single();

    const res = await fetchReport(request, baseURL, ownerToken, mainShopId);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // (a) การรวมของ Stock Value Cap Engine เอง (running counter) กับสูตรที่รายงานใช้ต้องเท่ากันเป๊ะ
    expect(Number(body.invariantCheck.allOwnerTypesPartsValue)).toBe(Number(shopRow.current_stock_value));
    expect(Number(body.invariantCheck.stockValueCapCurrentStockValue)).toBe(Number(shopRow.current_stock_value));

    // (b) ในชุดข้อมูลนี้ (ทุกชิ้นเป็น own, ซากปิดครบแล้ว) ข้อ 1 (on-balance total) ต้องเท่ากับตัวเลข
    // เดียวกันเป๊ะด้วย — นี่คือ invariant ที่การ์ดเตือนไว้โดยตรง
    expect(Number(body.section1.total)).toBe(Number(shopRow.current_stock_value));
    expect(Number(body.section1.total)).toBe(5000 * 2 + 20000);
  });

  test("SSR-002 ของฝากขาย (consignment) ไม่ถูกนับในข้อ 1 — แสดงแยกในข้อ 2 เท่านั้น", async ({ request, baseURL }) => {
    const { data: zone, error: zoneErr } = await adminClient()
      .from("zones")
      .insert({ shop_id: mainShopId, code: `CONSIGN-${RUN_ID}`, name: "โซนฝากขาย QA", owner_type: "consignment" })
      .select("id")
      .single();
    expect(zoneErr).toBeNull();
    zoneIds.push(zone.id);

    const { data: consignPart, error: partErr } = await adminClient()
      .from("parts")
      .insert({
        shop_id: mainShopId,
        part_name: `QA-CONSIGN-${RUN_ID}`,
        price: 9999,
        quantity: 1,
        is_active: true,
        zone_id: zone.id,
      })
      .select("id")
      .single();
    expect(partErr).toBeNull();
    partIds.push(consignPart.id);

    const res = await fetchReport(request, baseURL, ownerToken, mainShopId);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // ข้อ 2: ต้องปรากฏเป็น memo แยกใน section2 ตาม owner_type ที่แท้จริง
    const consignEntry = body.section2.byOwnerType.find((r) => r.ownerType === "consignment");
    expect(consignEntry).toBeTruthy();
    expect(Number(consignEntry.value)).toBeGreaterThanOrEqual(9999);

    // ข้อ 1: ต้อง "ไม่รวม" ชิ้นฝากขายนี้เด็ดขาด — ยืนยันด้วยการเช็คว่าโซนฝากขายไม่ปรากฏใน
    // breakdown "แยกตามโซน" ของ section1 เลย (section1 breakdown มาจาก 'own' parts เท่านั้น
    // ตาม fn_shop_stock_summary_totals — ดู db/stock_summary_report_migration.sql)
    const onBalanceZoneNames = body.section1.breakdown.byZone.map((r) => r.label);
    expect(onBalanceZoneNames).not.toContain("โซนฝากขาย QA");
  });

  test("SSR-003 กำไรต่อคันซาก: ถอด 10 ขาย 4 -> cost_recognized ใช้ allocated_cost ของ 4 ชิ้นที่ขายเท่านั้น", async ({
    request,
    baseURL,
  }) => {
    const { data: vehicle, error: vehicleErr } = await adminClient()
      .from("salvage_vehicles")
      .insert({
        shop_id: mainShopId,
        purchase_price: 100000,
        estimated_total_value: 100000,
        value_groups: [{ label: "QA", estimated_value: 100000 }],
      })
      .select("vehicle_id")
      .single();
    expect(vehicleErr).toBeNull();
    vehicleIds.push(vehicle.vehicle_id);

    const partRows = [];
    for (let i = 0; i < 10; i++) {
      const { data: p, error } = await adminClient()
        .from("parts")
        .insert({
          shop_id: mainShopId,
          part_name: `QA-VEH-PART-${RUN_ID}-${i}`,
          quantity: 1,
          is_active: true,
          salvage_vehicle_id: vehicle.vehicle_id,
          estimated_value: 10000, // 10 ชิ้น x 10000 = 100000 = estimated_total_value -> allocated_cost=10000/ชิ้น
        })
        .select("id, allocated_cost")
        .single();
      expect(error).toBeNull();
      expect(Number(p.allocated_cost)).toBe(10000);
      partIds.push(p.id);
      partRows.push(p);
    }

    // ขาย 4 ใน 10 ชิ้น ชิ้นละ 15000 บาท
    for (let i = 0; i < 4; i++) {
      const { data: sale, error } = await adminClient()
        .from("part_sales")
        .insert({
          shop_id: mainShopId,
          part_id: partRows[i].id,
          quantity_sold: 1,
          sale_price: 15000,
        })
        .select("sale_id")
        .single();
      expect(error).toBeNull();
      saleIds.push(sale.sale_id);
    }

    const res = await fetchReport(request, baseURL, ownerToken, mainShopId);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const row = body.section3.find((v) => v.vehicleId === vehicle.vehicle_id);
    expect(row).toBeTruthy();
    expect(Number(row.cumulativeRevenue)).toBe(4 * 15000); // 60000
    expect(Number(row.costRecognized)).toBe(4 * 10000); // 40000 (ไม่ใช่ 10*10000)
    expect(Number(row.profit)).toBe(4 * 15000 - 4 * 10000); // 20000
  });

  test("SSR-004 ค้างสต็อกนาน: boundary ที่เกณฑ์วันพอดี (90 วัน)", async ({ request, baseURL }) => {
    const now = Date.now();
    const staleDate = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString();
    const freshDate = new Date(now - 89 * 24 * 60 * 60 * 1000).toISOString();

    const { data: stalePart, error: staleErr } = await adminClient()
      .from("parts")
      .insert({
        shop_id: mainShopId,
        part_name: `QA-STALE-${RUN_ID}`,
        price: 100,
        quantity: 1,
        is_active: true,
        created_at: staleDate,
      })
      .select("id")
      .single();
    expect(staleErr).toBeNull();
    partIds.push(stalePart.id);

    const { data: freshPart, error: freshErr } = await adminClient()
      .from("parts")
      .insert({
        shop_id: mainShopId,
        part_name: `QA-FRESH-${RUN_ID}`,
        price: 100,
        quantity: 1,
        is_active: true,
        created_at: freshDate,
      })
      .select("id")
      .single();
    expect(freshErr).toBeNull();
    partIds.push(freshPart.id);

    const res = await fetchReport(request, baseURL, ownerToken, mainShopId);
    const body = await res.json();
    expect(body.section4.thresholdDays).toBe(90);

    const staleIds = body.section4.items.map((i) => i.partId);
    expect(staleIds).toContain(stalePart.id);
    expect(staleIds).not.toContain(freshPart.id);
  });

  test("SSR-005 Top 10: ข้อมูลน้อยกว่า 10 แสดงเท่าที่มีไม่ crash", async ({ request, baseURL }) => {
    const res = await fetchReport(request, baseURL, ownerToken, zeroSalvageShopId, "&days=30");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.section5.topSellers)).toBeTruthy();
    expect(body.section5.topSellers.length).toBeLessThanOrEqual(10);
    expect(Array.isArray(body.section5.slowSellers)).toBeTruthy();
    expect(body.section5.slowSellers.length).toBeLessThanOrEqual(10);
  });

  test("SSR-006 ร้านไม่มีซากรถเลย (ซื้อมาขายไปอย่างเดียว) -> ข้อ 3 ว่างสวยงาม รายงานส่วนอื่นปกติ", async ({
    request,
    baseURL,
  }) => {
    const { data: p, error } = await adminClient()
      .from("parts")
      .insert({ shop_id: zeroSalvageShopId, part_name: `QA-ONLYDIRECT-${RUN_ID}`, price: 1000, quantity: 1, is_active: true })
      .select("id")
      .single();
    expect(error).toBeNull();
    partIds.push(p.id);

    const res = await fetchReport(request, baseURL, ownerToken, zeroSalvageShopId);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.section3).toEqual([]);
    expect(Number(body.section1.total)).toBeGreaterThanOrEqual(1000);
  });

  test("SSR-007 Tier gate (API): ร้าน Founder เรียก API ไม่ได้ (403)", async ({ request, baseURL }) => {
    const founder = getTierShopOwner("founder");
    const { token } = await getAccessToken(founder.email, founder.password);
    // หา shop_id ของ founder tier shop ผ่าน membership ของ owner คนนี้ (service role)
    const { data: member } = await adminClient()
      .from("shop_members")
      .select("shop_id, shops:shop_id(subscription_plan)")
      .eq("role", "owner")
      .limit(50);
    const founderMember = (member || []).find((m) => m.shops?.subscription_plan === "founder");
    expect(founderMember).toBeTruthy();

    const res = await fetchReport(request, baseURL, token, founderMember.shop_id);
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Pro");
  });

  test("SSR-008 Tier gate (API): ร้าน Pro เรียก API ได้ปกติ (200)", async ({ request, baseURL }) => {
    const res = await fetchReport(request, baseURL, ownerToken, mainShopId);
    expect(res.ok()).toBeTruthy();
  });

  test("SSR-009 Tier gate (UI): ร้าน Founder ไม่เห็นลิงก์รายงานสรุปสต็อกใน /admin", async ({ page }) => {
    const founder = getTierShopOwner("founder");
    await loginWithEmail(page, founder.email, founder.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin");
    await expect(page.getByTestId("stock-summary-report-link")).toHaveCount(0);
  });

  test("SSR-010 Tier gate (UI): เข้า URL ตรงบนร้าน Founder ก็ยังโดน API 403 (แสดง error ในหน้า ไม่ใช่แค่ UI ซ่อนปุ่ม)", async ({
    page,
  }) => {
    const founder = getTierShopOwner("founder");
    await loginWithEmail(page, founder.email, founder.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/stock-summary-report");
    await expect(page.getByTestId("stock-summary-error")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("stock-summary-error")).toContainText("Pro");
  });

  test("SSR-011 Multi-tenant isolation: shop_id ของร้านอื่นที่ตัวเองไม่ใช่สมาชิก -> 403", async ({ request, baseURL }) => {
    const founder = getTierShopOwner("founder");
    const { token: founderToken } = await getAccessToken(founder.email, founder.password);
    // owner ของร้าน founder ไม่ใช่สมาชิกของ mainShopId (ร้าน pro ที่สร้างไว้เฉพาะเทสต์นี้)
    const res = await fetchReport(request, baseURL, founderToken, mainShopId);
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("ไม่มีสิทธิ์เข้าถึงอู่นี้");
  });
});
