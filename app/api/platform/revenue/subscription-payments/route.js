import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../lib/platformAdmin";

// การ์ด "Platform Revenue Module" — ไม่มี payment gateway/webhook ในระบบนี้เลย (ยืนยันด้วย grep)
// ต้องบันทึกด้วยมือโดย Super Admin: "Record subscription payment" (จำนวนเงิน + งวดที่ครอบคลุม)
// -> journal entry ตอนรับเงิน (Dr เงินสด/ธนาคาร / Cr รายได้รับล่วงหน้า) + revenue event + ตาราง
// amortization รายเดือน (หารเท่ากันทุกเดือน ตามตัวอย่างในการ์ด ไม่มี proration ตามวันที่ขอ)
const RECORD_REVENUE_ROLES = ["super_admin"];

export async function POST(request) {
  try {
    const authResult = await requirePlatformRole(request, RECORD_REVENUE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { shop_id, amount, period_start, months } = body;

    if (!shop_id || !amount || !period_start || !months) {
      return NextResponse.json(
        { error: "ข้อมูลไม่ครบ (shop_id/amount/period_start/months)" },
        { status: 400 }
      );
    }
    if (Number(amount) <= 0 || Number(months) <= 0) {
      return NextResponse.json({ error: "amount และ months ต้องมากกว่า 0" }, { status: 400 });
    }

    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("shop_name")
      .eq("shop_id", shop_id)
      .maybeSingle();

    // 1) journal entry ตอนรับเงิน — Dr เงินสด/ธนาคาร / Cr รายได้รับล่วงหน้า เต็มจำนวนที่จ่าย
    const { data: entry, error: entryError } = await supabaseAdmin.rpc("create_platform_journal_entry", {
      p_actor_user_id: authResult.userId,
      p_description: `รับชำระ subscription — ${shop?.shop_name || `shop_id ${shop_id}`} (${months} เดือน)`,
      p_source_type: "subscription",
      p_source_event_id: null,
      p_lines: [
        { account_code: "cash_bank", debit: Number(amount), credit: 0, shop_id },
        { account_code: "deferred_revenue", debit: 0, credit: Number(amount), shop_id },
      ],
    });
    if (entryError) throw entryError;

    const periodStartDate = new Date(period_start);
    const periodEndDate = new Date(periodStartDate);
    periodEndDate.setMonth(periodEndDate.getMonth() + Number(months));

    // 2) revenue event
    const { data: revenueEvent, error: eventError } = await supabaseAdmin
      .from("platform_revenue_events")
      .insert({
        shop_id,
        event_type: "subscription",
        amount: Number(amount),
        deferred_until: periodEndDate.toISOString(),
        period_start,
        period_end: periodEndDate.toISOString().slice(0, 10),
        journal_entry_id: entry.entry_id,
      })
      .select("event_id")
      .single();
    if (eventError) throw eventError;

    // 3) ตาราง amortization — หารเท่ากันทุกเดือน (ไม่ proration ตามวัน ตามตัวอย่างในการ์ด)
    const amountPerMonth = Number(amount) / Number(months);
    const scheduleRows = Array.from({ length: Number(months) }, (_, i) => {
      const recognizeOn = new Date(periodStartDate);
      recognizeOn.setMonth(recognizeOn.getMonth() + i + 1);
      return {
        revenue_event_id: revenueEvent.event_id,
        recognize_on: recognizeOn.toISOString().slice(0, 10),
        amount: amountPerMonth,
      };
    });
    const { error: scheduleError } = await supabaseAdmin
      .from("platform_deferred_revenue_schedule")
      .insert(scheduleRows);
    if (scheduleError) throw scheduleError;

    return NextResponse.json({ data: { event_id: revenueEvent.event_id, entry_id: entry.entry_id } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
