import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller } from "../../../../lib/teamAuth";
import { canSeeField } from "../../../../config/fieldVisibility";

// การ์ด "Field Visibility Whitelist กลาง (role × field group)" — retrofit ของ app/admin/reports/page.js
//
// ก่อนหน้านี้หน้ารายงาน (Informal Report — การ์ด Accounting Module) query ตรงจาก supabase client
// (RLS scope แค่ shop_id) แล้ว gate การเข้าถึงทั้งหน้าด้วย RequireAuth allowedRoles={["owner",
// "manager"]} แบบ hardcode — ต่างจาก default matrix ของการ์ดนี้ตรงๆ (sales_reports: supervisor
// = ✅ default, admin = ✅ เหมือน supervisor) และไม่มีทางให้ Owner override ต่อร้านได้เลย (เช่น
// เปิดให้ supervisor เห็นได้ หรือปิดไม่ให้ manager เห็นก็ไม่ได้) — ขัดกับกติกาข้อ 2 ของการ์ด
// "ทุกช่องทางต้องอ้าง matrix เดียวกัน ห้ามกำหนดแยกรายฟีเจอร์"
//
// route นี้ = จุดอ่านเดียวสำหรับหน้ารายงานยอดขาย — เช็ค canSeeField(role, "sales_reports") จาก
// matrix กลางแทน hardcode role list, และ mask ข้อมูลลูกค้า (sold_to / snapshot.customer_name)
// ตาม field group "customer_name" ด้วยเช่นกัน (คนละ field group กับ sales_reports เอง — role ที่
// เห็นรายงานได้ อาจจะยังเห็นชื่อลูกค้าไม่ได้ก็ได้ตาม matrix ถ้า shop override แยกไว้)
export async function GET(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const shopId = Number(searchParams.get("shop_id"));
    const rangeStart = searchParams.get("range_start"); // ISO string หรือไม่ส่งมา = ทั้งหมด
    if (!shopId) {
      return NextResponse.json({ error: "ไม่พบ shop_id" }, { status: 400 });
    }

    const { data: callerMember } = await supabaseAdmin
      .from("shop_members")
      .select("role")
      .eq("shop_id", shopId)
      .eq("user_id", authResult.userId)
      .eq("status", "active")
      .maybeSingle();

    if (!callerMember) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงอู่นี้" }, { status: 403 });
    }

    const { data: overrides } = await supabaseAdmin
      .from("shop_field_visibility_overrides")
      .select("role, field_group, allowed")
      .eq("shop_id", shopId);

    if (!canSeeField(callerMember.role, "sales_reports", overrides || [])) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ดูรายงานยอดขาย" }, { status: 403 });
    }

    const canSeeCustomerName = canSeeField(callerMember.role, "customer_name", overrides || []);

    let salesQuery = supabaseAdmin
      .from("part_sales")
      .select(
        "sale_id, quantity_sold, sale_price, sold_to, sold_at, payment_method, item_status, approval_status, part_id, parts(part_name)"
      )
      .eq("shop_id", shopId)
      .neq("item_status", "not_found")
      .neq("approval_status", "pending_approval")
      .order("sold_at", { ascending: false });
    if (rangeStart) salesQuery = salesQuery.gte("sold_at", rangeStart);

    let pendingApprovalCountQuery = supabaseAdmin
      .from("part_sales")
      .select("sale_id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("approval_status", "pending_approval");
    if (rangeStart) pendingApprovalCountQuery = pendingApprovalCountQuery.gte("sold_at", rangeStart);

    let billingQuery = supabaseAdmin
      .from("job_documents")
      .select("document_id, doc_number, snapshot, created_at, job_id")
      .eq("shop_id", shopId)
      .eq("doc_type", "billing")
      .order("created_at", { ascending: false });
    if (rangeStart) billingQuery = billingQuery.gte("created_at", rangeStart);

    const [salesRes, billingRes, pendingCountRes] = await Promise.all([
      salesQuery,
      billingQuery,
      pendingApprovalCountQuery,
    ]);
    if (salesRes.error) throw salesRes.error;
    if (billingRes.error) throw billingRes.error;

    const partSales = (salesRes.data || []).map((s) => ({
      ...s,
      sold_to: canSeeCustomerName ? s.sold_to : null,
    }));

    const billingDocs = (billingRes.data || []).map((d) => ({
      ...d,
      snapshot: {
        ...d.snapshot,
        customer_name: canSeeCustomerName ? d.snapshot?.customer_name : null,
      },
    }));

    return NextResponse.json({
      partSales,
      billingDocs,
      pendingApprovalCount: pendingCountRes.count || 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
