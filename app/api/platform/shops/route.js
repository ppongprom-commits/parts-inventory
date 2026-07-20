import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../lib/platformAdmin";

// Permission matrix (การ์ด Platform admin role tiers):
// GET (ดูรายชื่ออู่/สถิติ) — ทั้ง 3 role เห็นเหมือนกันหมด (Analyst อ่านได้เท่า Super Admin/Support)
// PATCH (แก้ subscription/billing) — Super Admin เท่านั้น
const VIEW_ROLES = ["super_admin", "support", "analyst"];
const BILLING_ROLES = ["super_admin"];

export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, VIEW_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: shops, error: shopsError } = await supabaseAdmin
      .from("shops")
      .select("*")
      .order("created_at", { ascending: false });

    if (shopsError) throw shopsError;

    const shopIds = shops.map((s) => s.shop_id);

    const { data: members } = await supabaseAdmin
      .from("shop_members")
      .select("shop_id, status")
      .in("shop_id", shopIds.length ? shopIds : [-1]);

    const activeCountMap = {};
    (members || []).forEach((m) => {
      if (m.status === "active") {
        activeCountMap[m.shop_id] = (activeCountMap[m.shop_id] || 0) + 1;
      }
    });

    const enriched = await Promise.all(
      shops.map(async (shop) => {
        let ownerEmail = null;
        try {
          const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(
            shop.owner_user_id
          );
          ownerEmail = ownerData?.user?.email || null;
        } catch {
          ownerEmail = null;
        }
        return {
          ...shop,
          active_member_count: activeCountMap[shop.shop_id] || 0,
          owner_email: ownerEmail,
        };
      })
    );

    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const authResult = await requirePlatformRole(request, BILLING_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { shop_id, subscription_status, subscription_plan, trial_ends_at, current_period_end } =
      body;

    if (!shop_id) {
      return NextResponse.json({ error: "ไม่พบ shop_id" }, { status: 400 });
    }

    // เขียนผ่าน RPC เดียว (mutation + audit log ในทรานแซคชันเดียวกัน) — ถ้าเขียน log ไม่สำเร็จ
    // การแก้ subscription จะ rollback ไปด้วยทั้งหมด (ตัดสินใจไว้แล้วในการ์ด Platform admin audit log)
    const { data, error } = await supabaseAdmin.rpc("platform_update_shop_subscription", {
      p_admin_user_id: authResult.userId,
      p_admin_role: authResult.role,
      p_shop_id: shop_id,
      p_subscription_status: subscription_status ?? null,
      p_subscription_plan: subscription_plan ?? null,
      p_trial_ends_at: trial_ends_at || null,
      p_current_period_end: current_period_end || null,
    });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
