import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";

async function verifyPlatformAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { error: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: "session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }

  const { data: adminRow } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { error: "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Platform Admin", status: 403 };
  }

  return { userId: userData.user.id };
}

export async function GET(request) {
  try {
    const authResult = await verifyPlatformAdmin(request);
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
    const authResult = await verifyPlatformAdmin(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { shop_id, subscription_status, subscription_plan, trial_ends_at, current_period_end } =
      body;

    if (!shop_id) {
      return NextResponse.json({ error: "ไม่พบ shop_id" }, { status: 400 });
    }

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

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
