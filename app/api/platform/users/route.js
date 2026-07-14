import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyPlatformAdmin } from "../../../../lib/platformAdmin";

// ดึงผู้ใช้ทั้งหมดจาก auth.users แบบวนหน้า (listUsers จำกัดหน้าละ perPage)
async function listAllAuthUsers() {
  const perPage = 200;
  let page = 1;
  let all = [];

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all = all.concat(data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return all;
}

export async function GET(request) {
  try {
    const authResult = await verifyPlatformAdmin(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const [authUsers, { data: memberships, error: memberError }] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin
        .from("shop_members")
        .select("user_id, shop_id, role, status, contact_name, contact_phone, created_at, shops(shop_name)"),
    ]);
    if (memberError) throw memberError;

    const membershipsByUser = {};
    (memberships || []).forEach((m) => {
      if (!membershipsByUser[m.user_id]) membershipsByUser[m.user_id] = [];
      membershipsByUser[m.user_id].push({
        shop_id: m.shop_id,
        shop_name: m.shops?.shop_name || "(ไม่พบชื่ออู่)",
        role: m.role,
        status: m.status,
        contact_name: m.contact_name,
        contact_phone: m.contact_phone,
        joined_at: m.created_at,
      });
    });

    const { data: platformAdmins } = await supabaseAdmin.from("platform_admins").select("user_id");
    const adminIds = new Set((platformAdmins || []).map((a) => a.user_id));

    const enriched = authUsers
      .map((u) => ({
        user_id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        is_platform_admin: adminIds.has(u.id),
        memberships: membershipsByUser[u.id] || [],
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
