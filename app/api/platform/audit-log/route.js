import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../lib/platformAdmin";

// Activity Log — timeline ของทุกการกระทำของ platform admin ที่กระทบข้อมูลลูกค้า
// (การ์ด "Platform admin audit log")
//
// สิทธิ์ดู: ทั้ง 3 role เห็นเหมือนกันหมด — ตามที่ตัดสินใจไว้ในการ์ด "Platform admin role tiers"
// (19 ก.ค. 2026): "Analyst เห็นข้อมูล billing/subscription เหมือน Super Admin/Support ทุกอย่าง
// (แค่ทำ action ไม่ได้)" ใช้หลักเดียวกันกับ Activity Log — Analyst อ่านได้ ทำ mutation ไม่ได้
// (mutation ทั้งหมดอยู่คนละ endpoint ที่บังคับ role แยกอยู่แล้ว)
//
// รองรับ filter ตามคน (admin_user_id) และตามอู่ (shop_id) + pagination (limit/offset)
const VIEW_ROLES = ["super_admin", "support", "analyst"];
const MAX_PAGE_SIZE = 200;

export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, VIEW_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const adminUserId = searchParams.get("admin_user_id");
    const shopId = searchParams.get("shop_id");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, MAX_PAGE_SIZE);
    const offset = Number(searchParams.get("offset")) || 0;

    let query = supabaseAdmin
      .from("platform_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (adminUserId) query = query.eq("admin_user_id", adminUserId);
    if (shopId) query = query.eq("target_shop_id", Number(shopId));

    const { data: rows, error, count } = await query;
    if (error) throw error;

    // เติมอีเมลของ admin + ชื่ออู่ ให้อ่านง่ายขึ้นในหน้า UI (ไม่ต้อง join เองฝั่ง client)
    const [adminEmails, shopNames] = await Promise.all([
      Promise.all(
        [...new Set((rows || []).map((r) => r.admin_user_id).filter(Boolean))].map(async (id) => {
          try {
            const { data } = await supabaseAdmin.auth.admin.getUserById(id);
            return [id, data?.user?.email || null];
          } catch {
            return [id, null];
          }
        })
      ),
      (async () => {
        const shopIds = [...new Set((rows || []).map((r) => r.target_shop_id).filter(Boolean))];
        if (!shopIds.length) return [];
        const { data } = await supabaseAdmin.from("shops").select("shop_id, shop_name").in("shop_id", shopIds);
        return (data || []).map((s) => [s.shop_id, s.shop_name]);
      })(),
    ]);
    const emailMap = Object.fromEntries(adminEmails);
    const shopNameMap = Object.fromEntries(shopNames);

    const enriched = (rows || []).map((r) => ({
      ...r,
      admin_email: emailMap[r.admin_user_id] || null,
      target_shop_name: r.target_shop_id ? shopNameMap[r.target_shop_id] || null : null,
    }));

    return NextResponse.json({ data: enriched, total: count ?? enriched.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ไม่มี PATCH/DELETE ที่นี่โดยตั้งใจ — append-only invariant (แม้ super_admin ก็แก้/ลบ log
// ตัวเองไม่ได้) เขียนได้ทางเดียวคือผ่าน RPC ที่ผูกกับการกระทำหลักแต่ละอย่างเท่านั้น
