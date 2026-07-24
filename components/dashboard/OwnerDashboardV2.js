"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import { JOB_STATUS_STYLE } from "../../lib/jobStatusLabels";

const OPEN_STATUSES = ["received", "in_progress", "waiting_parts"];
const TOP_N_JOBS = 5;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

export default function OwnerDashboardV2() {
  const { currentShopId, currentShop } = useAuth();

  const [loading, setLoading] = useState(true);
  const [openJobCount, setOpenJobCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [todayProfit, setTodayProfit] = useState(0);
  const [carsInRepair, setCarsInRepair] = useState([]);

  useEffect(() => {
    if (!currentShopId) return;
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function fetchDashboard() {
    setLoading(true);
    await Promise.all([
      fetchOpenJobCount(),
      fetchLowStockCount(),
      fetchTodaySalesAndProfit(),
      fetchCarsInRepair(),
    ]);
    setLoading(false);
  }

  async function fetchOpenJobCount() {
    const { count } = await supabase
      .from("jobs")
      .select("job_id", { count: "exact", head: true })
      .eq("shop_id", currentShopId)
      .is("deleted_at", null)
      .in("status", OPEN_STATUSES);
    setOpenJobCount(count || 0);
  }

  // เหมือน app/page.js (~บรรทัด 60-66) — นับจาก view low_stock_parts ที่กรองไว้แล้วว่าใกล้หมด
  async function fetchLowStockCount() {
    const { count } = await supabase
      .from("low_stock_parts")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", currentShopId);
    setLowStockCount(count || 0);
  }

  async function fetchTodaySalesAndProfit() {
    // ⚠️ ยอดขาย/กำไรวันนี้: schema ปัจจุบันยังไม่มีฟิลด์ "ต้นทุน" ที่ผูกกับ job_cost_items
    // โดยตรง (ไม่เหมือน part_sales ที่ยังไม่มีต้นทุนอะไหล่ถอดเก็บไว้เช่นกัน) จึงใช้ proxy ง่ายๆ
    // ก่อน: ยอดขายวันนี้ = ผลรวม job_cost_items.amount ของงานที่ "ปิดวันนี้" (closed_at อยู่ในวันนี้)
    // ส่วนกำไรสุทธิ = ผลรวมเฉพาะรายการหมวด labor/other (ตัดหมวด parts ออก เพราะเป็นแค่ยอดที่คิด
    // จากลูกค้าโดยไม่รู้ต้นทุนจริงของอะไหล่ชิ้นนั้น ถือว่ายังไม่ realized เป็นกำไรจนกว่าจะมีข้อมูล
    // ต้นทุนอะไหล่ในระบบ) — เป็นตัวเลขประมาณการ ไม่ใช่ยอดบัญชีที่แม่นยำ
    const { data: closedJobs } = await supabase
      .from("jobs")
      .select("job_id")
      .eq("shop_id", currentShopId)
      .gte("closed_at", startOfToday().toISOString())
      .lt("closed_at", startOfTomorrow().toISOString());

    const jobIds = (closedJobs || []).map((j) => j.job_id);
    if (jobIds.length === 0) {
      setTodaySales(0);
      setTodayProfit(0);
      return;
    }

    const { data: costItems } = await supabase
      .from("job_cost_items")
      .select("amount, category")
      .in("job_id", jobIds);

    const items = costItems || [];
    const sales = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const profit = items
      .filter((i) => i.category !== "parts")
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    setTodaySales(sales);
    setTodayProfit(profit);
  }

  async function fetchCarsInRepair() {
    // เรียงตามวันที่คาดว่าจะเสร็จก่อน (ใกล้สุดขึ้นก่อน, ที่ยังไม่กำหนดไปอยู่ท้าย) แล้วค่อย
    // เรียงตามวันที่รับรถเข้าเป็นตัวจัดลำดับรอง — ครอบคลุมทั้งกรณีบางงานมี/ไม่มีวันที่คาดว่าจะเสร็จ
    // และกรณีทุกงานยังไม่มีวันที่คาดว่าจะเสร็จเลย (จะ fallback ไปเรียงตาม created_at โดยอัตโนมัติ)
    const { data, error } = await supabase
      .from("jobs")
      .select("job_id, car_brand, car_model, license_plate, status, estimated_completion_date, created_at")
      .eq("shop_id", currentShopId)
      .is("deleted_at", null)
      .in("status", OPEN_STATUSES)
      .order("estimated_completion_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(TOP_N_JOBS);
    if (!error) setCarsInRepair(data || []);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📊 แดชบอร์ดสำหรับเจ้าของ{currentShop?.shop_name ? ` — ${currentShop.shop_name}` : ""}</h1>
      </div>

      {loading && <div className="empty">กำลังโหลด...</div>}

      {!loading && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ยอดขายวันนี้ (ประมาณการ)</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{todaySales.toLocaleString()} บาท</div>
            </div>
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>กำไรสุทธิวันนี้ (ประมาณการ)</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{todayProfit.toLocaleString()} บาท</div>
            </div>
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>งานที่เปิดอยู่</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{openJobCount} งาน</div>
            </div>
          </div>

          {lowStockCount > 0 && (
            <div
              className="msg error"
              style={{
                marginBottom: 20,
                borderColor: "#f59e0b",
                background: "rgba(245, 158, 11, 0.1)",
                color: "#f59e0b",
              }}
            >
              ⚠️ มีของสิ้นเปลืองใกล้หมด {lowStockCount} รายการ
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>🚗 รถที่กำลังซ่อม</h2>
            <Link href="/jobs" className="nav-link secondary" style={{ fontSize: 13 }}>
              ดูทั้งหมด →
            </Link>
          </div>

          {carsInRepair.length === 0 && <div className="empty">ไม่มีรถที่กำลังซ่อมอยู่ตอนนี้</div>}

          {carsInRepair.map((j) => (
            <Link
              href={`/jobs/${j.job_id}`}
              className="card"
              key={j.job_id}
              style={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
            >
              <div style={{ fontSize: 22 }}>🔧</div>
              <div className="card-body" style={{ flex: 1 }}>
                <div className="card-title">
                  {j.car_brand} {j.car_model}
                  {j.license_plate ? ` · ${j.license_plate}` : ""}
                </div>
                <div className="card-sub">
                  คาดว่าจะเสร็จ: {formatDate(j.estimated_completion_date)}
                </div>
              </div>
              <span className="tag" style={{ color: JOB_STATUS_STYLE[j.status]?.color }}>
                {JOB_STATUS_STYLE[j.status]?.label}
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
