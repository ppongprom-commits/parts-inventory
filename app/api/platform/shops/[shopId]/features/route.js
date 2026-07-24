import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../../lib/platformAdmin";

// การ์ด "Platform-controlled shop features" (24 ก.ค. 2026) — toggle feature flag ระดับร้าน
// (force_zone_scan_confirmation, branches_feature_enabled) ทั้งคู่กำหนด "สิทธิ์ที่ร้านใช้งานได้"
// (entitlement) เหมือน subscription_plan จึงจำกัดแค่ super_admin เท่านั้น (permission matrix
// เดียวกับ BILLING_ROLES ที่ app/api/platform/shops/route.js ใช้อยู่แล้ว — ไม่รวม support เพราะ
// นี่ไม่ใช่งาน routine support ธรรมดาแบบ join-as-support/branch CRUD)
//
// allow-list ต้อง validate เองที่ชั้นนี้ด้วย (ไม่เชื่อ client เฉยๆ) แม้ RPC
// platform_set_shop_feature() จะมี allow-list ของตัวเองอยู่แล้วก็ตาม (defense-in-depth)
const ALLOWED_FEATURES = ["force_zone_scan_confirmation", "branches_feature_enabled"];
const MANAGE_ROLES = ["super_admin"];

export async function PATCH(request, { params }) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = Number(params.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "shopId ไม่ถูกต้อง" }, { status: 400 });
    }

    const body = await request.json();
    const { feature, enabled } = body;

    if (!ALLOWED_FEATURES.includes(feature)) {
      return NextResponse.json({ error: `ไม่รู้จัก feature "${feature}"` }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled ต้องเป็น true/false" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("platform_set_shop_feature", {
      p_actor_user_id: authResult.userId,
      p_shop_id: shopId,
      p_feature: feature,
      p_enabled: enabled,
    });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
