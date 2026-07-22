import { test, expect } from "@playwright/test";
import {
  signInEmail,
  signInStaff,
  adminClient,
  getShopIdByName,
  getMemberIdByUsername,
  setMemberRoleStatus,
} from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

// ------------------------------------------------------------
// TC-207: is_shop_member() (lib RLS helper) query shop_members สดทุกครั้งที่มี request
// (ไม่ใช่ JWT claim ที่ cache ไว้ตอน login) ดังนั้นถ้า owner เปลี่ยน role/status ของใครกลางคัน
// การเปลี่ยนแปลงต้องมีผลทันทีตั้งแต่ request ถัดไป แม้ session/token เดิมของคนนั้นจะยังไม่หมดอายุ
// ก็ตาม — เทสต์นี้พิสูจน์โดย "ไม่ sign in ใหม่เลย" ใช้ client เดิมตัวเดียวกันตลอดทั้งเทสต์
// ------------------------------------------------------------

let mainShopId;
let technicianMemberId;
const createdPartIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  technicianMemberId = await getMemberIdByUsername(mainShopId, accounts.technician.username);
});

test.afterAll(async () => {
  // คืนสถานะ technician กลับเป็น active เสมอ ไม่ว่า test จะ pass/fail
  // (ป้องกัน suite อื่นที่ใช้ accounts.technician พังเพราะ status ค้างเป็น disabled)
  await setMemberRoleStatus(technicianMemberId, "technician", "active");
  for (const id of createdPartIds) {
    await adminClient().from("parts").delete().eq("id", id);
  }
});

test("TC-207 owner เปลี่ยน status ของ technician เป็น disabled กลางคัน แล้ว technician (session เดิม ไม่ login ใหม่) ทำ insert/update ไม่ได้ทันที", async () => {
  // 1) technician login ครั้งเดียว — เก็บ client ไว้ใช้ตลอดทั้งเทสต์ ไม่ sign in ซ้ำอีกเลย
  const { client: technicianClient } = await signInStaff(
    accounts.technician.username,
    accounts.technician.pin
  );

  // 2) ก่อนโดน demote: insert part ต้องสำเร็จตามปกติ (positive control)
  const insertBefore = await technicianClient
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: "QA role-change test part (before)" })
    .select("id")
    .single();
  expect(insertBefore.error).toBeNull();
  createdPartIds.push(insertBefore.data.id);

  // 3) owner login แยก แล้วเรียก RPC เปลี่ยน status ของ technician เป็น disabled
  //    (mirror ของ handleRoleChange() ใน app/admin/team/page.js)
  const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
  const { error: rpcError } = await ownerClient.rpc("update_member_role", {
    p_member_id: technicianMemberId,
    p_new_role: "technician",
    p_new_status: "disabled",
  });
  expect(rpcError).toBeNull();

  // 4) กลับมาใช้ technicianClient ตัวเดิม (คนละ object กับ ownerClient, ไม่เคย sign in ใหม่
  //    ไม่เคย refresh token ใดๆ ทั้งสิ้น) ลอง insert part อีกครั้ง -> ต้องถูกปฏิเสธทันที
  const insertAfter = await technicianClient
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: "QA role-change test part (after — should fail)" })
    .select("id");
  expect(insertAfter.error).not.toBeNull();

  // 5) ลอง update part ที่ตัวเองเพิ่งสร้างไว้ตอนยัง active อยู่ (ข้อ 2) ก็ต้องถูกปฏิเสธเช่นกัน
  const updateAfter = await technicianClient
    .from("parts")
    .update({ notes: "should not be allowed" })
    .eq("id", insertBefore.data.id)
    .select();
  expect(updateAfter.error).toBeNull(); // RLS update ที่ไม่ผ่าน = 0 แถว ไม่ error
  expect(updateAfter.data).toEqual([]);

  // 6) ยืนยันด้วย service role ว่า notes ไม่ได้ถูกแก้จริง
  const { data: verifyUnchanged } = await adminClient()
    .from("parts")
    .select("notes")
    .eq("id", insertBefore.data.id)
    .single();
  expect(verifyUnchanged.notes).toBeNull();

  // afterAll() ด้านบนจะ revert status กลับเป็น active ให้เองเสมอ
});
