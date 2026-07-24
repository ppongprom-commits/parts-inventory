// Card: "Accounting Module — ผังบัญชี + journal entries + intercompany" (scoped-down first pass,
// 24 ก.ค. 2026, Notion 3a1f39f4564981bcba6ce1b5e8c66761)
//
// Pattern เดียวกับ qa-automation/tests/stock-summary-report.spec.js: สร้าง shop แยกของตัวเอง
// ต่อ tier (createShop() helper เดียวกัน — ต้องสร้าง branches row ก่อนเสมอ เพราะ
// shop_members.branch_id เป็น NOT NULL จากงาน Multi-branch ที่ทำขนานอยู่) เพื่อไม่ชนกับ shop
// ที่ suite อื่น/worker อื่นใช้งานพร้อมกันอยู่ — ส่วนใหญ่ยิงตรง DB/RPC ผ่าน adminClient +
// signed-in owner client (ต้อง auth.uid() จริงเพราะ is_shop_member()/create_journal_entry()
// เช็ค auth.uid() ตรงๆ ไม่ผ่านด้วย service-role bypass) ยกเว้น 2 จุดที่ต้องเดิน UI จริง: sale
// flow ผ่าน /edit/[id] และ tier-gate UI-hide ที่ /admin
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient } from "../fixtures/db-client.js";
import { accounts, supabaseUrl, supabasePublishableKey, getTierShopOwner } from "../fixtures/test-data.js";

const RUN_ID = Date.now();

async function getOwnerClient(email, password) {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ล้มเหลว (${email}): ${error.message}`);
  return { client, userId: data.user.id };
}

// mirror ของ createShop() ใน stock-summary-report.spec.js
async function createShop({ name, plan, ownerUserId }) {
  const { data, error } = await adminClient()
    .from("shops")
    .insert({ shop_name: name, subscription_plan: plan, owner_user_id: ownerUserId })
    .select("shop_id")
    .single();
  if (error) throw new Error(`สร้างร้าน ${name} ไม่สำเร็จ: ${error.message}`);

  const { data: branch, error: branchError } = await adminClient()
    .from("branches")
    .insert({ shop_id: data.shop_id, branch_code: "00000", branch_name: "สาขาหลัก (QA)", is_default: true })
    .select("branch_id")
    .single();
  if (branchError) throw new Error(`สร้างสาขาหลักไม่สำเร็จ: ${branchError.message}`);

  const { error: memberError } = await adminClient()
    .from("shop_members")
    .insert({ shop_id: data.shop_id, user_id: ownerUserId, role: "owner", status: "active", branch_id: branch.branch_id });
  if (memberError) throw new Error(`เพิ่ม owner membership ไม่สำเร็จ: ${memberError.message}`);
  return data.shop_id;
}

async function makePart(shopId, { zoneId, price = 100 } = {}) {
  const { data, error } = await adminClient()
    .from("parts")
    .insert({
      shop_id: shopId,
      part_name: `QA-ACC-PART-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`,
      price,
      quantity: 10,
      item_type: "salvage",
      zone_id: zoneId || null,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data.id;
}

async function journalLinesFor(saleId) {
  const { data: entries } = await adminClient()
    .from("journal_entries")
    .select("entry_id, source_type")
    .eq("source_table", "part_sales")
    .eq("source_id", saleId);
  if (!entries || entries.length === 0) return { entries: [], lines: [] };
  const { data: lines } = await adminClient()
    .from("journal_entry_lines")
    .select("account_code, debit, credit")
    .in(
      "entry_id",
      entries.map((e) => e.entry_id)
    );
  return { entries, lines: lines || [] };
}

test.describe("Accounting Module — core (scoped-down first pass)", () => {
  test.describe.configure({ mode: "serial" });

  let ownerUserId;
  let ownerClient;
  let proShopId; // pro tier — eligible for module

  const partIds = [];
  const saleIds = [];
  const zoneIds = [];
  const consignorIds = [];
  const shopIds = [];

  test.beforeAll(async () => {
    const { client, userId } = await getOwnerClient(accounts.owner.email, accounts.owner.password);
    ownerClient = client;
    ownerUserId = userId;

    proShopId = await createShop({ name: `QA Accounting Pro ${RUN_ID}`, plan: "pro", ownerUserId });
    shopIds.push(proShopId);
  });

  test.afterAll(async () => {
    for (const id of saleIds) await adminClient().from("part_sales").delete().eq("sale_id", id);
    for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
    for (const id of zoneIds) await adminClient().from("zones").delete().eq("id", id);
    for (const id of consignorIds) await adminClient().from("consignors").delete().eq("consignor_id", id);
    for (const id of shopIds) {
      await adminClient().from("journal_entries").delete().eq("shop_id", id);
      await adminClient().from("accounting_periods").delete().eq("shop_id", id);
      await adminClient().from("accounting_accounts").delete().eq("shop_id", id);
      await adminClient().from("shop_members").delete().eq("shop_id", id);
      await adminClient().from("branches").delete().eq("shop_id", id);
      await adminClient().from("shops").delete().eq("shop_id", id);
    }
  });

  test("ACC-001 เปิด module สำเร็จบน shop tier Pro — seed ผังบัญชีมาตรฐานอัตโนมัติ", async () => {
    const { data, error } = await ownerClient.rpc("set_accounting_module_enabled", {
      p_shop_id: proShopId,
      p_enabled: true,
    });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(0); // ไม่มี sale ค้างให้ backfill ตอนนี้

    const { data: shopRow } = await adminClient()
      .from("shops")
      .select("accounting_module_enabled")
      .eq("shop_id", proShopId)
      .single();
    expect(shopRow.accounting_module_enabled).toBe(true);

    const { data: accountsData } = await adminClient()
      .from("accounting_accounts")
      .select("account_code")
      .eq("shop_id", proShopId);
    expect(accountsData.length).toBeGreaterThanOrEqual(9);
    expect(accountsData.map((a) => a.account_code)).toContain("1010100"); // เงินสด
    expect(accountsData.map((a) => a.account_code)).toContain("4060100"); // รายได้ขายอะไหล่
  });

  test("ACC-002 debit=credit invariant — create_journal_entry ปฏิเสธรายการไม่สมดุล ทันทีตอน insert", async () => {
    const { error } = await ownerClient.rpc("create_journal_entry", {
      p_shop_id: proShopId,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_description: "QA unbalanced test",
      p_source_type: "manual",
      p_source_table: null,
      p_source_id: null,
      p_lines: [
        { account_code: "1010100", debit: 100, credit: 0 },
        { account_code: "4060100", debit: 0, credit: 50 },
      ],
    });
    expect(error, "ต้องถูกปฏิเสธเพราะ debit != credit").not.toBeNull();
    expect(error.message).toMatch(/ไม่สมดุล/);
  });

  test("ACC-003 create_journal_entry รับรายการที่สมดุลจริง", async () => {
    const { data, error } = await ownerClient.rpc("create_journal_entry", {
      p_shop_id: proShopId,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_description: "QA balanced test",
      p_source_type: "manual",
      p_source_table: null,
      p_source_id: null,
      p_lines: [
        { account_code: "1010100", debit: 100, credit: 0 },
        { account_code: "4060100", debit: 0, credit: 100 },
      ],
    });
    expect(error, error?.message).toBeNull();
    expect(data).not.toBeNull();
  });

  test("ACC-004 ขายเงินสด (own) -> journal entry อัตโนมัติ ถูกต้องครบ (revenue+VAT+COGS)", async () => {
    const partId = await makePart(proShopId, { price: 1000 });
    partIds.push(partId);

    const { data: sale, error } = await adminClient()
      .from("part_sales")
      .insert({
        part_id: partId,
        shop_id: proShopId,
        quantity_sold: 1,
        sale_price: 1000,
        sold_by: ownerUserId,
        payment_method: "cash",
        item_status: "completed",
        approval_status: "not_required",
      })
      .select("sale_id")
      .single();
    expect(error, error?.message).toBeNull();
    saleIds.push(sale.sale_id);

    const { entries, lines } = await journalLinesFor(sale.sale_id);
    expect(entries.length).toBe(1);
    expect(entries[0].source_type).toBe("sale_own");

    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);

    const cash = lines.find((l) => l.account_code === "1010100");
    const revenue = lines.find((l) => l.account_code === "4060100");
    const vat = lines.find((l) => l.account_code === "2050100");
    const cogs = lines.find((l) => l.account_code === "5080100");
    expect(Number(cash.debit)).toBeCloseTo(1070, 2); // 1000 + 7% VAT
    expect(Number(revenue.credit)).toBeCloseTo(1000, 2);
    expect(Number(vat.credit)).toBeCloseTo(70, 2);
    expect(Number(cogs.debit)).toBeCloseTo(1000, 2); // ไม่มี allocated_cost -> fallback ใช้ price
  });

  test("ACC-005 ขายเชื่อ (credit payment_method) -> Dr ลูกหนี้การค้า แทน Dr เงินสด", async () => {
    const partId = await makePart(proShopId, { price: 500 });
    partIds.push(partId);

    const { data: sale, error } = await adminClient()
      .from("part_sales")
      .insert({
        part_id: partId,
        shop_id: proShopId,
        quantity_sold: 1,
        sale_price: 500,
        sold_by: ownerUserId,
        payment_method: "credit",
        item_status: "completed",
        approval_status: "not_required",
      })
      .select("sale_id")
      .single();
    expect(error, error?.message).toBeNull();
    saleIds.push(sale.sale_id);

    const { lines } = await journalLinesFor(sale.sale_id);
    const ar = lines.find((l) => l.account_code === "1020100"); // ลูกหนี้การค้า
    const cash = lines.find((l) => l.account_code === "1010100");
    expect(ar).toBeTruthy();
    expect(Number(ar.debit)).toBeCloseTo(535, 2); // 500 + 7% VAT
    expect(cash).toBeFalsy(); // ไม่ควรแตะบัญชีเงินสดเลยตอนขายเชื่อ
  });

  test("ACC-006 ขายฝากขาย (consignment) -> ไม่มี COGS, แยกคอมมิชชั่น/เจ้าหนี้ผู้ฝากขายถูกต้อง", async () => {
    const { data: consignor, error: consignorError } = await adminClient()
      .from("consignors")
      .insert({ shop_id: proShopId, name: `QA Consignor ${RUN_ID}`, default_commission_rate: 0.2 })
      .select("consignor_id")
      .single();
    expect(consignorError, consignorError?.message).toBeNull();
    consignorIds.push(consignor.consignor_id);

    const { data: zone, error: zoneError } = await adminClient()
      .from("zones")
      .insert({
        shop_id: proShopId,
        code: `QA-ACC-CONSIGN-${RUN_ID}`,
        owner_type: "consignment",
        owner_entity_id: consignor.consignor_id,
      })
      .select("id")
      .single();
    expect(zoneError, zoneError?.message).toBeNull();
    zoneIds.push(zone.id);

    const partId = await makePart(proShopId, { zoneId: zone.id, price: 2000 });
    partIds.push(partId);

    const { data: sale, error } = await adminClient()
      .from("part_sales")
      .insert({
        part_id: partId,
        shop_id: proShopId,
        quantity_sold: 1,
        sale_price: 2000,
        sold_by: ownerUserId,
        payment_method: "cash",
        item_status: "completed",
        approval_status: "not_required",
      })
      .select("sale_id")
      .single();
    expect(error, error?.message).toBeNull();
    saleIds.push(sale.sale_id);

    const { entries, lines } = await journalLinesFor(sale.sale_id);
    expect(entries[0].source_type).toBe("sale_consignment");

    const cogs = lines.find((l) => l.account_code === "5080100");
    const inventory = lines.find((l) => l.account_code === "1030100");
    expect(cogs, "ขายฝากขายต้องไม่มี COGS เลย").toBeFalsy();
    expect(inventory, "ขายฝากขายต้องไม่ตัดสินค้าคงเหลือของร้านเอง").toBeFalsy();

    const commission = lines.find((l) => l.account_code === "4070100");
    const payable = lines.find((l) => l.account_code === "2010100");
    expect(Number(commission.credit)).toBeCloseTo(400, 2); // 2000 * 20%
    expect(Number(payable.credit)).toBeCloseTo(1600, 2); // 2000 - 400

    const { data: consignorRow } = await adminClient()
      .from("consignors")
      .select("ar_payable_balance")
      .eq("consignor_id", consignor.consignor_id)
      .single();
    expect(Number(consignorRow.ar_payable_balance)).toBeCloseTo(1600, 2);
  });

  test("ACC-007 module OFF -> ไม่สร้าง journal entry เลย แต่ part_sales ยังบันทึกปกติ", async () => {
    await ownerClient.rpc("set_accounting_module_enabled", { p_shop_id: proShopId, p_enabled: false });

    const partId = await makePart(proShopId, { price: 300 });
    partIds.push(partId);

    const { data: sale, error } = await adminClient()
      .from("part_sales")
      .insert({
        part_id: partId,
        shop_id: proShopId,
        quantity_sold: 1,
        sale_price: 300,
        sold_by: ownerUserId,
        payment_method: "cash",
        item_status: "completed",
        approval_status: "not_required",
      })
      .select("sale_id")
      .single();
    expect(error, error?.message).toBeNull(); // การขายไม่พังแม้ module ปิด
    saleIds.push(sale.sale_id);

    const { entries } = await journalLinesFor(sale.sale_id);
    expect(entries.length).toBe(0);
  });

  test("ACC-008 backfill-on-enable — เปิด module เจอ sale ที่ค้างในงวดปัจจุบัน -> backfill ให้อัตโนมัติ", async () => {
    // sale จาก ACC-007 (module ปิดตอนขาย) ยังไม่มี journal entry — เปิด module อีกครั้งต้อง backfill ให้
    const { data: backfillCount, error } = await ownerClient.rpc("set_accounting_module_enabled", {
      p_shop_id: proShopId,
      p_enabled: true,
    });
    expect(error, error?.message).toBeNull();
    expect(Number(backfillCount)).toBeGreaterThanOrEqual(1);

    const lastSaleId = saleIds[saleIds.length - 1];
    const { entries } = await journalLinesFor(lastSaleId);
    expect(entries.length).toBe(1);
  });

  test("ACC-009 ปิดงวดบัญชี -> post entry ใหม่เข้างวดที่ปิดแล้วถูกปฏิเสธ", async () => {
    const periodLabel = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { error: closeError } = await ownerClient.rpc("close_accounting_period", {
      p_shop_id: proShopId,
      p_period_label: periodLabel,
    });
    expect(closeError, closeError?.message).toBeNull();

    const { error: rejectError } = await ownerClient.rpc("create_journal_entry", {
      p_shop_id: proShopId,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_description: "QA reject-closed-period test",
      p_source_type: "manual",
      p_source_table: null,
      p_source_id: null,
      p_lines: [
        { account_code: "1010100", debit: 10, credit: 0 },
        { account_code: "4060100", debit: 0, credit: 10 },
      ],
    });
    expect(rejectError, "ต้องถูกปฏิเสธเพราะงวดปิดแล้ว").not.toBeNull();
    expect(rejectError.message).toMatch(/ปิดไปแล้ว/);

    // ปิดงวดซ้ำอีกครั้งต้อง reject เช่นกัน (idempotency guard)
    const { error: doubleCloseError } = await ownerClient.rpc("close_accounting_period", {
      p_shop_id: proShopId,
      p_period_label: periodLabel,
    });
    expect(doubleCloseError, "ปิดงวดที่ปิดไปแล้วซ้ำต้อง error").not.toBeNull();
  });

  test("ACC-010 tier gate — ปฏิเสธเปิด module บน shop tier ที่ไม่ผ่าน (trial)", async () => {
    const trialOwner = getTierShopOwner("trial");
    const { client: trialClient, userId: trialUserId } = await getOwnerClient(trialOwner.email, trialOwner.password);

    const { data: memberRow } = await adminClient()
      .from("shop_members")
      .select("shop_id")
      .eq("user_id", trialUserId)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1)
      .single();
    const trialShopId = memberRow.shop_id;

    const { error } = await trialClient.rpc("set_accounting_module_enabled", {
      p_shop_id: trialShopId,
      p_enabled: true,
    });
    expect(error, "shop tier trial ต้องถูกปฏิเสธไม่ให้เปิดโมดูลบัญชี").not.toBeNull();
    expect(error.message).toMatch(/แพ็กเกจ/);

    const { data: shopRow } = await adminClient()
      .from("shops")
      .select("accounting_module_enabled")
      .eq("shop_id", trialShopId)
      .single();
    expect(shopRow.accounting_module_enabled).toBe(false);
  });

  test("ACC-011 UI — /admin ซ่อนการ์ดเปิดใช้งานโมดูลบัญชีสำหรับ tier ที่ไม่ผ่าน (trial)", async ({ page }) => {
    const trialOwner = getTierShopOwner("trial");
    await loginWithEmail(page, trialOwner.email, trialOwner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin");

    await expect(page.getByText("โมดูลบัญชี (Accounting Module)")).toBeVisible();
    await expect(page.getByText(/อยู่ในแพ็กเกจ Pro ขึ้นไป/)).toBeVisible();
    await expect(page.getByTestId("toggle-accounting-module")).toHaveCount(0);
  });

  test("ACC-012 informal vs formal report — ยอดขายจาก part_sales ตรงกับผลรวม journal revenue+VAT ของชุดเดียวกัน", async () => {
    // ใช้ sale ทั้งหมดที่สร้างไว้ใน suite นี้ (module เปิดอยู่ตั้งแต่ ACC-008) เทียบยอดขายจาก
    // part_sales (informal — ตรงกับสูตรที่ app/admin/reports/page.js ใช้อยู่แล้ว) กับผลรวม
    // debit ฝั่งเงินสด/ลูกหนี้ของ journal entries (formal) — ต้องเป็นฐานข้อมูลชุดเดียวกัน ไม่ drift
    const { data: sales } = await adminClient()
      .from("part_sales")
      .select("sale_id, quantity_sold, sale_price")
      .in("sale_id", saleIds)
      .eq("item_status", "completed");
    const informalTotal = sales.reduce((s, r) => s + Number(r.quantity_sold) * Number(r.sale_price), 0);

    const { data: entries } = await adminClient()
      .from("journal_entries")
      .select("entry_id")
      .eq("source_table", "part_sales")
      .in("source_id", saleIds);
    const entryIds = entries.map((e) => e.entry_id);
    const { data: revenueLines } = await adminClient()
      .from("journal_entry_lines")
      .select("credit")
      .in("entry_id", entryIds)
      .in("account_code", ["4060100", "4070100"]); // revenue (own) + commission revenue (consignment)

    // formal revenue รวม != informal sale total เสมอสำหรับ consignment (รายได้จริงคือแค่คอมมิชชั่น
    // ไม่ใช่ยอดขายเต็ม) — เทียบเฉพาะยอดจาก own-model sales (ACC-004/005/007/008) แทน ซึ่งควรตรงกัน
    // เป๊ะ (revenue บัญชี 4060100 ไม่รวม VAT เหมือน sale_price*qty เดิม)
    const ownRevenueLines = await adminClient()
      .from("journal_entry_lines")
      .select("credit, entry_id")
      .in("entry_id", entryIds)
      .eq("account_code", "4060100");
    const ownFormalTotal = ownRevenueLines.data.reduce((s, r) => s + Number(r.credit), 0);

    const { data: ownSourceIds } = await adminClient()
      .from("journal_entries")
      .select("source_id")
      .in("entry_id", ownRevenueLines.data.map((r) => r.entry_id));
    const ownSaleIds = ownSourceIds.map((r) => r.source_id);
    const ownInformalTotal = sales
      .filter((s) => ownSaleIds.includes(s.sale_id))
      .reduce((s, r) => s + Number(r.quantity_sold) * Number(r.sale_price), 0);

    expect(ownFormalTotal).toBeCloseTo(ownInformalTotal, 2);
    expect(informalTotal).toBeGreaterThan(0);
  });
});
