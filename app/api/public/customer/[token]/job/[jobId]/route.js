import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdminClient";

const VISIBILITY_DAYS = 731;

export async function GET(request, { params }) {
  try {
    const { token, jobId } = await params;

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("customer_id, name, phone, shop_id")
      .eq("share_token", token)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return NextResponse.json({ error: "ไม่พบข้อมูลลูกค้า (ลิงก์ไม่ถูกต้อง)" }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select(
        "job_id, shop_id, car_brand, car_model, car_year_display, license_plate, source_type, status, created_at, closed_at, photo_urls, customer_id"
      )
      .eq("job_id", jobId)
      .maybeSingle();

    if (jobError) throw jobError;

    // ต้องเป็นงานของลูกค้าคนนี้เท่านั้น กันคนอื่นเดา job_id มั่ว
    if (!job || job.customer_id !== customer.customer_id) {
      return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
    }

    // เช็คกฎการมองเห็น 731 วันเหมือนหน้ารายการ
    if (job.closed_at) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - VISIBILITY_DAYS);
      if (new Date(job.closed_at) < cutoffDate) {
        return NextResponse.json({ error: "งานนี้พ้นระยะเวลาที่ดูได้แล้ว" }, { status: 404 });
      }
    }

    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("shop_name, company_name")
      .eq("shop_id", job.shop_id)
      .maybeSingle();

    const { data: costItems, error: costError } = await supabaseAdmin
      .from("job_cost_items")
      .select("item_id, category, description, amount, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (costError) throw costError;

    const total = (costItems || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);

    return NextResponse.json({
      data: {
        shop_name: shop?.company_name || shop?.shop_name || "",
        customer_name: customer.name,
        job,
        cost_items: costItems || [],
        total,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
