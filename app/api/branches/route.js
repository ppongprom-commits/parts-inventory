import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdminClient";
import { verifyCaller, verifyShopManager, checkBranchLimit } from "../../../lib/teamAuth";

// การ์ด "Multi-branch support (Pro=2 สาขา, Enterprise=ไม่จำกัด)" — Notion
// 3a1f39f45649810cb1fffbfa5da1d799
//
// GET  /api/branches?shop_id=X   -> รายชื่อสาขาที่ user คนนี้เข้าถึงได้ (owner/manager เห็นหมด,
//                                    role อื่นเห็นเฉพาะสาขาที่ตัวเองมีแถว shop_members อยู่จริง)
// POST /api/branches             -> สร้างสาขาใหม่ (เฉพาะ owner/manager, ต้องผ่าน tier limit ทั้ง
//                                    ชั้น API นี้ และชั้น DB trigger trg_branches_tier_limit —
//                                    "always enforce both layers" ตาม convention ของโปรเจกต์นี้)
export async function GET(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const shopId = Number(searchParams.get("shop_id"));
    if (!shopId) {
      return NextResponse.json({ error: "ไม่พบ shop_id" }, { status: 400 });
    }

    const { data: memberRows } = await supabaseAdmin
      .from("shop_members")
      .select("role, branch_id")
      .eq("shop_id", shopId)
      .eq("user_id", authResult.userId)
      .eq("status", "active");

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงอู่นี้" }, { status: 403 });
    }

    const isCrossBranch = memberRows.some((m) => ["owner", "manager"].includes(m.role));
    const branchIds = [...new Set(memberRows.map((m) => m.branch_id).filter((b) => b != null))];
    const roleByBranch = Object.fromEntries(memberRows.map((m) => [m.branch_id, m.role]));

    let branchQuery = supabaseAdmin
      .from("branches")
      .select("branch_id, branch_code, branch_name, is_default, is_active, is_read_only, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });
    if (!isCrossBranch) {
      branchQuery = branchQuery.in("branch_id", branchIds.length ? branchIds : [-1]);
    }

    const { data: branches, error } = await branchQuery;
    if (error) throw error;

    const withRole = (branches || []).map((b) => ({
      ...b,
      // owner/manager มี role เดียวกันทุกสาขา (cross-branch โดยดีไซน์) — ใช้ role ตัวแรกที่เจอ
      my_role: roleByBranch[b.branch_id] || memberRows.find((m) => ["owner", "manager"].includes(m.role))?.role,
    }));

    return NextResponse.json({ branches: withRole });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;

    const body = await request.json();
    const shopId = body.shop_id;
    const branchName = (body.branch_name || "").trim();
    const branchCode = (body.branch_code || "").trim();

    const managerCheck = await verifyShopManager(shopId, userId);
    if (managerCheck.error) {
      return NextResponse.json({ error: managerCheck.error }, { status: managerCheck.status });
    }

    if (shopId == null || !branchName) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ (shop_id/branch_name)" }, { status: 400 });
    }
    if (branchCode && !/^\d{5}$/.test(branchCode)) {
      return NextResponse.json(
        { error: "รหัสสาขาต้องเป็นตัวเลข 5 หลักตามรูปแบบกรมสรรพากร (เช่น 00001)" },
        { status: 400 }
      );
    }

    // Tier limit — ชั้น API (403/400 reject) คู่กับชั้น DB (trg_branches_tier_limit) เสมอ
    // ตาม convention ของโปรเจกต์นี้ที่ทุกฟีเจอร์ tier-gated ต้องเช็คทั้ง 2 ชั้น
    const limitCheck = await checkBranchLimit(shopId);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 400 });
    }

    // auto-assign รหัสสาขาถัดไปถ้าไม่ได้ระบุมา (00001, 00002, ... ตามจำนวนสาขาที่มีอยู่แล้ว)
    let resolvedCode = branchCode;
    if (!resolvedCode) {
      const { count } = await supabaseAdmin
        .from("branches")
        .select("branch_id", { count: "exact", head: true })
        .eq("shop_id", shopId);
      resolvedCode = String(count || 0).padStart(5, "0");
    }

    const { data: branch, error: insertError } = await supabaseAdmin
      .from("branches")
      .insert({
        shop_id: shopId,
        branch_code: resolvedCode,
        branch_name: branchName,
        is_default: false,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      // trg_branches_tier_limit โยน error message ภาษาไทยที่อ่านง่ายอยู่แล้ว (ใช้ raise exception
      // ตรงๆ ใน db/multi_branch_support_migration.sql) ส่งต่อให้ผู้ใช้เห็นได้เลย
      throw insertError;
    }

    return NextResponse.json({ data: branch });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
