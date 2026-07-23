import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../lib/platformAdmin";
import { getTierConfig } from "../../../../../config/subscriptionTiers";

// การ์ด "Platform Revenue Module" — ขอบเขต subscription tracking เท่านั้น (commission ยังไม่ทำ)
// GET (dashboard สรุป) — ทั้ง 3 role เห็นเหมือนกัน (ตรงกับ pattern เดิมของ /api/platform/shops)
const DASHBOARD_ROLES = ["super_admin", "support", "analyst"];

export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, DASHBOARD_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: shops, error: shopsError } = await supabaseAdmin
      .from("shops")
      .select("shop_id, subscription_status, subscription_plan");
    if (shopsError) throw shopsError;

    // MRR/ARR รวม + แยกตาม tier — นับ active + past_due (ยังไม่ยกเลิก แค่ค้างชำระ ถือว่ายัง
    // เป็นรายได้ที่คาดหวังอยู่ ต่างจาก suspended/canceled ที่ตัดออก)
    const billableShops = (shops || []).filter((s) =>
      ["active", "past_due"].includes(s.subscription_status)
    );
    const mrrByTier = {};
    let mrrTotal = 0;
    billableShops.forEach((s) => {
      const tier = getTierConfig(s.subscription_plan);
      const price = tier.priceMonthly || 0;
      mrrByTier[s.subscription_plan] = (mrrByTier[s.subscription_plan] || 0) + price;
      mrrTotal += price;
    });

    const { data: deferredRows, error: deferredError } = await supabaseAdmin
      .from("platform_deferred_revenue_schedule")
      .select("amount")
      .eq("recognized", false);
    if (deferredError) throw deferredError;
    const deferredRemaining = (deferredRows || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // กราฟเติบโตรายเดือน — จาก saas_service_revenue ที่ recognize แล้วจริง (journal-based ไม่ใช่
    // ประมาณจาก shops.subscription_plan สด — สะท้อนรายได้ที่ "รับรู้แล้ว" จริงตามหลักบัญชี)
    const { data: revenueLines, error: linesError } = await supabaseAdmin
      .from("platform_journal_entry_lines")
      .select("credit, entry_id, platform_journal_entries!inner(entry_date)")
      .eq("account_code", "saas_service_revenue");
    if (linesError) throw linesError;

    const monthlyGrowth = {};
    (revenueLines || []).forEach((line) => {
      const month = line.platform_journal_entries?.entry_date?.slice(0, 7);
      if (!month) return;
      monthlyGrowth[month] = (monthlyGrowth[month] || 0) + Number(line.credit || 0);
    });

    return NextResponse.json({
      data: {
        mrrTotal,
        arrTotal: mrrTotal * 12,
        mrrByTier,
        deferredRemaining,
        monthlyGrowth, // { "2026-07": 12345, ... }
        commissionRevenue: null, // การ์ด: บล็อกด้วย marketplace feature ที่ยังไม่ออกแบบ — placeholder
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
