import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { requirePlatformRole, logPlatformAction } from "../../../../lib/platformAdmin";

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

    const { data: oldShop } = await supabaseAdmin
      .from("shops")
      .select("subscription_status, subscription_plan, trial_ends_at, current_period_end")
      .eq("shop_id", shop_id)
      .maybeSingle();

    const updatePayload = {};
    if (subscription_status !== undefined) updatePayload.subscription_status = subscription_status;
    if (subscription_plan !== undefined) updatePayload.subscription_plan = subscription_plan;
    if (trial_ends_at !== undefined) updatePayload.trial_ends_at = trial_ends_at || null;
    if (current_period_end !== undefined)
      updatePayload.current_period_end = current_period_end || null;

    if (subscription_status === "suspended") updatePayload.suspended_at = new Date().toISOString();
    if (subscription_status === "canceled") updatePayload.canceled_at = new Date().toISOString();
    if (subscription_status === "past_due") updatePayload.past_due_since = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("shops")
      .update(updatePayload)
      .eq("shop_id", shop_id)
      .select()
      .single();

    if (error) throw error;

    await logPlatformAction({
      adminUserId: authResult.userId,
      adminRole: authResult.role,
      action: "update_shop_subscription",
      targetShopId: shop_id,
      oldData: oldShop,
      newData: data,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
