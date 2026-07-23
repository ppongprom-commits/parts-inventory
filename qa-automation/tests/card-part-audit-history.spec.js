// การ์ด "ขยาย audit_log ให้ครอบทั้งระบบ" (ส่วน parts) + UI "🕘 ประวัติการแก้ไข" ที่ /edit/[id]
// คืนวันที่ 21 ก.ค. 2026 — components/PartAuditHistory.js เรียก RPC get_part_audit_history
//
// ครอบคลุมทั้ง regression ที่เกิดขึ้นเองในคืนนั้น (สร้าง trigger เฉพาะ parts แยกของตัวเอง
// โดยไม่รู้ว่ามี fn_audit_row_change() กลางอยู่แล้ว) และการแก้กลับใน
// db/audit_log_full_coverage_migration.sql (no-op UPDATE ต้องไม่สร้างแถวใหม่)
import { test, expect } from "@playwright/test";
import { loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName, signInStaff } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let partId;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  // หน้า /edit/[id] ตอนนี้บังคับต้องมีรูปอย่างน้อย 1 รูปก่อนบันทึกได้ (ดู handleSubmit ใน
  // app/edit/[id]/page.js: totalPhotoCount === 0 -> block ทั้งฟอร์ม ไม่เรียก update เลย) —
  // AUDIT-003 ต้องเซฟผ่าน UI จริงได้ จึงต้อง seed photo_url/photo_urls มาด้วย ไม่งั้นกด
  // "บันทึกการแก้ไข" แล้วจะโดนบล็อกเงียบๆ ไม่มี error message ให้เห็นเลย
  const { data, error } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-AUDIT-${Date.now()}`,
      price: 100,
      item_type: "salvage",
      photo_url: "https://placehold.co/400x300.png",
      photo_urls: ["https://placehold.co/400x300.png"],
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  partId = data.id;
});

test.afterAll(async () => {
  if (partId) await adminClient().from("parts").delete().eq("id", partId);
});

test("AUDIT-001 no-op UPDATE (ค่าเดิมเป๊ะ) ไม่สร้างแถวใหม่ใน audit_log — regression ที่แก้คืนนี้", async () => {
  const { data: before } = await adminClient().from("audit_log").select("audit_id").eq("table_name", "parts").eq("record_uuid", partId);
  const countBefore = before.length;

  const { data: current } = await adminClient().from("parts").select("price").eq("id", partId).single();
  await adminClient().from("parts").update({ price: current.price }).eq("id", partId); // ค่าเดิมเป๊ะ

  const { data: after } = await adminClient().from("audit_log").select("audit_id").eq("table_name", "parts").eq("record_uuid", partId);
  expect(after.length, "no-op update ไม่ควรสร้าง audit_log แถวใหม่").toBe(countBefore);
});

test("AUDIT-002 UPDATE ที่เปลี่ยนค่าจริง สร้างแถวใหม่พร้อม old_data/new_data ถูกต้อง", async () => {
  const { data: before } = await adminClient().from("audit_log").select("audit_id").eq("table_name", "parts").eq("record_uuid", partId);
  const countBefore = before.length;

  await adminClient().from("parts").update({ price: 250 }).eq("id", partId);

  const { data: after } = await adminClient()
    .from("audit_log")
    .select("audit_id, old_data, new_data")
    .eq("table_name", "parts")
    .eq("record_uuid", partId)
    .order("changed_at", { ascending: false });
  expect(after.length).toBe(countBefore + 1);
  expect(Number(after[0].old_data.price)).toBe(100);
  expect(Number(after[0].new_data.price)).toBe(250);
});

test("AUDIT-003 หน้า /edit/[id] แก้ราคาผ่าน UI จริง แล้วเปิด '🕘 ประวัติการแก้ไข' เห็นรายการล่าสุด", async ({ page }) => {
  await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
  await expectLoginSucceeded(page);

  await page.goto(`/edit/${partId}`);
  await page.getByLabel("ราคา (บาท)").fill("777");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.locator(".msg.success", { hasText: "บันทึกการแก้ไขเรียบร้อยแล้ว" })).toBeVisible({ timeout: 8000 });

  // components/PartAuditHistory.js ดึงประวัติแค่ตอน mount (useEffect ผูกกับ partId เฉยๆ ไม่มี
  // reactivity ผูกกับการเซฟของฟอร์มพ่อ) แถมหลังเซฟสำเร็จหน้านี้ยัง router.push("/") อัตโนมัติใน
  // 800ms — เปิด panel ทันทีจะยังเห็นข้อมูลเก่าค้างจากตอนโหลดหน้าแรก (แค่ "สร้างรายการ") ต้อง
  // goto หน้า /edit/[id] ซ้ำเพื่อ mount ใหม่ให้ query audit_log ล่าสุดจริง ๆ ก่อนเปิด panel
  await page.goto(`/edit/${partId}`);
  await page.getByTestId("part-history-toggle").click();
  await expect(page.getByTestId("part-history-list")).toBeVisible();
  // แถวบนสุด (ล่าสุด) ต้องมี diff ของ ราคาขาย: 100 → 777 (part ของเทสนี้สร้างใหม่ด้วย price:100)
  await expect(page.getByTestId("part-history-list")).toContainText("ราคาขาย");
  await expect(page.getByTestId("part-history-list")).toContainText("777");
});

test("AUDIT-004 supervisor เห็นประวัติได้ผ่าน RPC (SECURITY DEFINER) แม้ query audit_log ตรงๆ ผ่าน RLS จะเห็น 0 แถว", async () => {
  const { client: supClient } = await signInStaff(accounts.supervisor.username, accounts.supervisor.pin);

  // RLS ของ audit_log จำกัดไว้แค่ owner/manager (ดู audit_log_parts_coverage_migration.sql) —
  // supervisor query ตรงๆ ต้องเห็น 0 แถว ไม่ใช่ error (RLS ปฏิเสธแบบ filter ไม่ใช่ throw)
  const { data: directQuery, error: directErr } = await supClient
    .from("audit_log")
    .select("audit_id")
    .eq("table_name", "parts")
    .eq("record_uuid", partId);
  expect(directErr).toBeNull();
  expect(directQuery).toEqual([]);

  // แต่ผ่าน RPC (security definer, เช็คสิทธิ์เป็นสมาชิกร้านของ part นี้แทน) ต้องเห็นได้
  const { data: viaRpc, error: rpcErr } = await supClient.rpc("get_part_audit_history", { p_part_id: partId });
  expect(rpcErr).toBeNull();
  expect(viaRpc.length).toBeGreaterThan(0);
});

test("AUDIT-005 [known gap] field_scanner แก้ไข part ได้ แต่ RPC ประวัติไม่รวม field_scanner ไว้ในรายชื่อ role ที่อนุญาต", async () => {
  // db/audit_log_parts_coverage_migration.sql: get_part_audit_history() เช็ค
  // is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']) —
  // ไม่มี 'field_scanner' ในลิสต์ ทั้งที่ field_scanner แก้ไข part ได้จริง (allowedRoles ของ
  // /edit/[id] มี field_scanner รวมอยู่ด้วย) — ไม่ใช่บั๊กที่เทสต์นี้ทำให้เกิด แค่ flag ไว้เป็น
  // known gap ที่ทีม dev ควรตัดสินใจว่าตั้งใจหรือไม่ (RPC นี้เขียนก่อนการ์ด Field Scanner Role
  // จะเพิ่ม role ใหม่เข้ามาในคืนเดียวกัน)
  const { client: fsClient } = await signInStaff(accounts.fieldScanner.username, accounts.fieldScanner.pin);
  const { error } = await fsClient.rpc("get_part_audit_history", { p_part_id: partId });
  expect(error, "field_scanner ถูกปฏิเสธจาก RPC นี้ในปัจจุบัน — known gap ไม่ใช่ assertion ว่าพฤติกรรมนี้ถูกต้อง").not.toBeNull();
});
