import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdminClient";

const VISIBILITY_DAYS = 731;

export async function GET(request, { params }) {
  try {
    const { token } = params;

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("customer_id, name, phone, shop_id")
      .eq("share_token", token)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return NextResponse.json({ error: "ไม่พบข้อมูลลูกค้า (ลิงก์ไม่ถูกต้อง)" }, { status: 404 });
    }

    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("shop_name, company_name")
      .eq("shop_id", customer.shop_id)
      .maybeSingle();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - VISIBILITY_DAYS);

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("jobs")
      .select(
        "job_id, car_brand, car_model, car_year_display, license_plate, source_type, status, created_at, closed_at, photo_urls"
      )
      .eq("customer_id", customer.customer_id)
      .order("created_at", { ascending: false });

    if (jobsError) throw jobsError;

    // มองเห็นได้ถ้ายังไม่ปิดงาน หรือปิดงานมาไม่เกิน 731 วัน
    const visibleJobs = (jobs || []).filter((j) => {
      if (!j.closed_at) return true;
      return new Date(j.closed_at) >= cutoffDate;
    });

    // ดึงยอดรวมค่าใช้จ่ายแต่ละงานมาแนบให้ (ไม่ต้องเรียก endpoint แยกทีละงาน)
    const jobIds = visibleJobs.map((j) => j.job_id);
    let totalsByJob = {};
    if (jobIds.length > 0) {
      const { data: costItems } = await supabaseAdmin
        .from("job_cost_items")
        .select("job_id, amount")
        .in("job_id", jobIds);

      (costItems || []).forEach((c) => {
        totalsByJob[c.job_id] = (totalsByJob[c.job_id] || 0) + Number(c.amount || 0);
      });
    }

    const jobsWithTotal = visibleJobs.map((j) => ({
      ...j,
      total_cost: totalsByJob[j.job_id] || 0,
    }));

    return NextResponse.json({
      data: {
        customer_name: customer.name,
        shop_name: shop?.company_name || shop?.shop_name || "",
        jobs: jobsWithTotal,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
