"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { SESSION_ID_HEADER, getStoredSessionId } from "../../../lib/sessionTracking";

const RANGES = [
  { key: "today", label: "วันนี้" },
  { key: "week", label: "7 วันล่าสุด" },
  { key: "month", label: "30 วันล่าสุด" },
  { key: "all", label: "ทั้งหมด" },
];

function getRangeStart(rangeKey) {
  const now = new Date();
  if (rangeKey === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (rangeKey === "week") {
    now.setDate(now.getDate() - 7);
    return now;
  }
  if (rangeKey === "month") {
    now.setDate(now.getDate() - 30);
    return now;
  }
  return null; // all
}

function ReportsPageContent() {
  const { currentShopId } = useAuth();

  const [range, setRange] = useState("month");
  const [loading, setLoading] = useState(true);
  const [partSales, setPartSales] = useState([]);
  const [billingDocs, setBillingDocs] = useState([]);
  // จำนวนรายการขายอะไหล่ไม่มีราคาที่ยังรออนุมัติ (ไม่รวมในยอดข้างบนเลย) — แค่โชว์ให้รู้ว่ามีอยู่
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (currentShopId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, range]);

  // การ์ด "Field Visibility Whitelist กลาง (role × field group)" — retrofit: ดึงผ่าน
  // app/api/reports/sales/route.js แทนการ query ตรงจาก client — server เช็ค
  // canSeeField(role, "sales_reports") จาก matrix กลาง (แทน hardcode RequireAuth allowedRoles
  // เดิมที่ไม่ตรงกับ default matrix ของการ์ดนี้ — supervisor/admin ควรเห็นได้ default) และ mask
  // ชื่อลูกค้าตาม field group "customer_name" ก่อนส่งกลับเสมอ (ไม่ใช่ query ตรงแล้วซ่อนที่ client)
  //
  // เนื้อหาการรวม/กรอง item_status='not_found' และ approval_status='pending_approval' (บั๊กที่
  // เคยแก้ + การ์ด Approval Flow แบบ configurable) ย้ายไปอยู่ใน route นั้นแทน ตรรกะเดิมไม่เปลี่ยน
  async function fetchData() {
    setLoading(true);
    setForbidden(false);
    const rangeStart = getRangeStart(range);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const url = new URL("/api/reports/sales", window.location.origin);
    url.searchParams.set("shop_id", currentShopId);
    if (rangeStart) url.searchParams.set("range_start", rangeStart.toISOString());

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        [SESSION_ID_HEADER]: getStoredSessionId() || "",
      },
    });

    if (res.status === 403) {
      setForbidden(true);
      setPartSales([]);
      setBillingDocs([]);
      setPendingApprovalCount(0);
      setLoading(false);
      return;
    }

    const json = await res.json().catch(() => ({}));
    setPartSales(json.partSales || []);
    setBillingDocs(json.billingDocs || []);
    setPendingApprovalCount(json.pendingApprovalCount || 0);
    setLoading(false);
  }

  const partSalesTotal = partSales.reduce((sum, s) => sum + Number(s.quantity_sold) * Number(s.sale_price), 0);
  const partSalesQty = partSales.reduce((sum, s) => sum + Number(s.quantity_sold), 0);

  // แยกตามวิธีชำระเงิน (ตัดสินใจแล้วในการ์ด Accounting Module scope "Informal Report")
  const PAYMENT_METHOD_LABELS = { cash: "เงินสด", bank_transfer: "โอนเงิน", card: "บัตร", other: "อื่นๆ" };
  const byPaymentMethod = {};
  partSales.forEach((s) => {
    const key = s.payment_method || "unspecified";
    byPaymentMethod[key] = (byPaymentMethod[key] || 0) + Number(s.quantity_sold) * Number(s.sale_price);
  });

  const billingTotal = billingDocs.reduce((sum, d) => sum + Number(d.snapshot?.grand_total || 0), 0);

  const grandTotal = partSalesTotal + billingTotal;

  // สรุปยอดรายวัน (รวมทั้ง 2 แหล่ง) สำหรับกราฟแท่งง่ายๆ
  const dailyTotals = {};
  partSales.forEach((s) => {
    const day = new Date(s.sold_at).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
    dailyTotals[day] = (dailyTotals[day] || 0) + Number(s.quantity_sold) * Number(s.sale_price);
  });
  billingDocs.forEach((d) => {
    const day = new Date(d.created_at).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
    dailyTotals[day] = (dailyTotals[day] || 0) + Number(d.snapshot?.grand_total || 0);
  });
  const dailyEntries = Object.entries(dailyTotals).slice(-14); // ล่าสุด 14 วันที่มีข้อมูล
  const maxDaily = Math.max(1, ...dailyEntries.map(([, v]) => v));

  return (
    <div className="container">
      <div className="header">
        <h1>📊 รายงานการขาย</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div className="view-toggle" style={{ marginBottom: 16, width: "100%" }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={range === r.key ? "active" : ""}
            onClick={() => setRange(r.key)}
            style={{ flex: 1 }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {forbidden ? (
        <div className="empty" data-testid="reports-forbidden">
          🔒 ไม่มีสิทธิ์ดูรายงานยอดขาย (ติดต่อเจ้าของร้านถ้าคิดว่าควรเห็นได้)
        </div>
      ) : loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : (
        <>
          {/* สรุปยอดรวม */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ยอดขายรวมทั้งหมด</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{grandTotal.toLocaleString()} บาท</div>
            </div>
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ขายอะไหล่ถอด</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{partSalesTotal.toLocaleString()} บาท</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{partSalesQty} ชิ้น</div>
            </div>
            <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ยอดใบแจ้งหนี้งานซ่อม</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{billingTotal.toLocaleString()} บาท</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{billingDocs.length} ใบ</div>
            </div>
          </div>

          {pendingApprovalCount > 0 && (
            <div className="msg" data-testid="pending-approval-note" style={{ marginBottom: 16 }}>
              ⏳ ไม่รวม {pendingApprovalCount} รายการขายอะไหล่ที่ยังไม่ตีราคา รอการอนุมัติอยู่ (ดูที่
              หน้า &quot;🕒 รออนุมัติ&quot; ใน /admin)
            </div>
          )}

          {/* กราฟแท่งรายวันแบบง่าย */}
          {dailyEntries.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>ยอดขายรายวัน</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 6,
                  height: 120,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {dailyEntries.map(([day, total]) => (
                  <div
                    key={day}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                    title={`${day}: ${total.toLocaleString()} บาท`}
                  >
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 24,
                        height: `${Math.max(4, (total / maxDaily) * 90)}px`,
                        background: "#2563eb",
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                    <div style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{day}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* แยกตามวิธีชำระเงิน (Informal Report scope — Accounting Module) */}
          {partSales.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                ยอดขายอะไหล่ แยกตามวิธีชำระเงิน
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(byPaymentMethod).map(([method, total]) => (
                  <div
                    className="card"
                    key={method}
                    style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", minWidth: 120 }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {PAYMENT_METHOD_LABELS[method] || "ไม่ระบุ"}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{total.toLocaleString()} บาท</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* รายการขายอะไหล่ถอด */}
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>🔧 รายการขายอะไหล่ถอด</h2>
          {partSales.length === 0 && <div className="empty">ยังไม่มีการขายในช่วงนี้</div>}
          {partSales.map((s) => (
            <div className="card" key={s.sale_id} style={{ cursor: "default" }}>
              <div className="card-body">
                <div className="card-title">{s.parts?.part_name || "-"}</div>
                <div className="card-sub">
                  {s.quantity_sold} ชิ้น × {Number(s.sale_price).toLocaleString()} บาท
                  {s.sold_to && ` — ${s.sold_to}`}
                </div>
                <div className="card-sub" style={{ fontSize: 11 }}>
                  {new Date(s.sold_at).toLocaleString("th-TH")}
                </div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {(Number(s.quantity_sold) * Number(s.sale_price)).toLocaleString()} บาท
              </div>
            </div>
          ))}

          {/* รายการใบแจ้งหนี้งานซ่อม */}
          <h2 style={{ fontSize: 16, margin: "20px 0 10px" }}>🧾 ใบแจ้งหนี้งานซ่อม</h2>
          {billingDocs.length === 0 && <div className="empty">ยังไม่มีใบแจ้งหนี้ในช่วงนี้</div>}
          {billingDocs.map((d) => (
            <Link
              href={`/jobs/${d.job_id}/documents/${d.document_id}`}
              className="card"
              key={d.document_id}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="card-body">
                <div className="card-title">
                  {d.snapshot?.car_brand} {d.snapshot?.car_model}
                  {d.snapshot?.license_plate ? ` · ${d.snapshot.license_plate}` : ""}
                </div>
                <div className="card-sub">
                  {d.snapshot?.customer_name || "-"} — เลขที่ {d.doc_number}
                </div>
                <div className="card-sub" style={{ fontSize: 11 }}>
                  {new Date(d.created_at).toLocaleString("th-TH")}
                </div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {Number(d.snapshot?.grand_total || 0).toLocaleString()} บาท
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

// การ์ด "Field Visibility Whitelist กลาง (role × field group)" — ก่อนหน้านี้ hardcode
// allowedRoles={["owner","manager"]} ตรงนี้ ซึ่งไม่ตรงกับ default matrix กลาง (supervisor/admin
// ควรเห็นรายงานได้ default) — ย้าย gate จริงไปที่ canSeeField("sales_reports") ฝั่ง server
// (app/api/reports/sales/route.js) แทน หน้านี้เปิดให้ทุก role ที่ล็อกอินเข้ามาดูได้ (ไม่รวม
// field_scanner ที่ไม่มีสิทธิ์ทำรายการขาย/ดูอะไรเกี่ยวกับ jobs เลยตามการ์ดของ role นั้น) แล้วให้
// server ตัดสินว่าเห็นข้อมูลจริงได้ไหม (ขึ้นกับ default + override ต่อร้าน)
export default function ReportsPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "admin"]}>
      <ReportsPageContent />
    </RequireAuth>
  );
}
