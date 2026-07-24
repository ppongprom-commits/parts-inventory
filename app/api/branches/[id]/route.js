import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller, verifyShopManager } from "../../../../lib/teamAuth";
import { getTierConfig, isUnlimited } from "../../../../config/subscriptionTiers";

// PATCH /api/branches/:id — เฉพาะ owner/manager ของร้านนั้น
// body: { branch_name? , is_read_only? }
//
// การ์ด "Downgrade Enterprise→Pro ขณะมีสาขาเกิน limit" — ✅ ตัดสินใจแล้ว: ยอม downgrade แต่สาขา
// ส่วนเกิน (ที่เจ้าของร้านไม่เลือกเก็บเป็น active) กลายเป็น read-only แทนการลบ/บล็อก downgrade —
// endpoint นี้คือจุดที่เจ้าของร้าน "เลือก" ว่าสาขาไหนจะเป็น read-only ผ่านการ toggle is_read_only
// เอง (ไม่ใช่ trigger อัตโนมัติตอน downgrade — เจ้าของร้านต้องเป็นคนเลือกตามที่การ์ดระบุ)
export async function PATCH(request, { params }) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;
    const branchId = Number(params.id);

    const { data: branch, error: branchError } = await supabaseAdmin
      .from("branches")
      .select("branch_id, shop_id, is_default")
      .eq("branch_id", branchId)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) {
      return NextResponse.json({ error: "ไม่พบสาขานี้" }, { status: 404 });
    }

    const managerCheck = await verifyShopManager(branch.shop_id, userId);
    if (managerCheck.error) {
      return NextResponse.json({ error: managerCheck.error }, { status: managerCheck.status });
    }

    const body = await request.json();
    const update = {};

    if (typeof body.branch_name === "string" && body.branch_name.trim()) {
      update.branch_name = body.branch_name.trim();
    }

    if (typeof body.is_read_only === "boolean") {
      // สาขา default (สาขาแรกของร้าน) ห้ามเป็น read-only เด็ดขาด — ต้องมีสาขาที่ใช้งานได้จริง
      // อย่างน้อย 1 สาขาเสมอ ไม่งั้นร้านที่ downgrade กลับไป Starter (1 สาขา) จะใช้งานไม่ได้เลย
      if (branch.is_default && body.is_read_only === true) {
        return NextResponse.json(
          { error: "ตั้งสาขาหลัก (สาขาแรกของร้าน) เป็น read-only ไม่ได้ — ต้องมีอย่างน้อย 1 สาขาที่ใช้งานได้เสมอ" },
          { status: 400 }
        );
      }
      update.is_read_only = body.is_read_only;

      // ถ้ากำลังจะปลด read-only (เปิดสาขากลับมาใช้งานได้ปกติ) ต้องเช็ค tier limit ก่อน — กัน
      // เจ้าของร้านเปิดสาขาที่ read-only อยู่กลับมา "เขียนได้" จนเกิน limit ของแพ็กเกจปัจจุบัน
      // นับเฉพาะสาขาที่ active+ไม่ read-only (คือ "ใช้โควตาจริง") ไม่ใช้ checkBranchLimit() ตรงๆ
      // เพราะฟังก์ชันนั้นนับ is_active ทั้งหมดรวมสาขา read-only ด้วย (เหมาะกับตอนสร้างสาขาใหม่
      // มากกว่า ไม่ตรงกับ semantics ของการ "ปลด read-only" ที่ต้องนับเฉพาะสาขาที่เขียนได้จริง)
      if (body.is_read_only === false) {
        const { data: shop } = await supabaseAdmin
          .from("shops")
          .select("subscription_plan")
          .eq("shop_id", branch.shop_id)
          .single();
        const tier = getTierConfig(shop?.subscription_plan);
        if (!isUnlimited(tier.maxBranches)) {
          const { count } = await supabaseAdmin
            .from("branches")
            .select("branch_id", { count: "exact", head: true })
            .eq("shop_id", branch.shop_id)
            .eq("is_active", true)
            .eq("is_read_only", false)
            .neq("branch_id", branchId);
          if ((count || 0) >= tier.maxBranches) {
            return NextResponse.json(
              {
                error: `เปิดสาขานี้กลับมาใช้งานไม่ได้ — จำนวนสาขาที่ใช้งานอยู่ถึงขีดจำกัดของแพ็กเกจ ${tier.label} แล้ว (สูงสุด ${tier.maxBranches} สาขา)`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("branches")
      .update(update)
      .eq("branch_id", branchId)
      .select()
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
