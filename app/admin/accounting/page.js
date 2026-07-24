"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { getTierConfig } from "../../../config/subscriptionTiers";
import { hasAccountingModuleFeature } from "../../../config/accountingConfig";

// Card: "Accounting Module — ผังบัญชี + journal entries + intercompany" (scoped-down first pass,
// 24 ก.ค. 2026, Notion 3a1f39f4564981bcba6ce1b5e8c66761)
//
// ขอบเขต UI รอบนี้: ตารางง่ายๆ พอ (ตามที่การ์ดบอกให้เน้นความถูกต้องของ ledger mechanics มากกว่า UI
// polish) — ผังบัญชี, รายการ journal entries (พร้อมบรรทัด debit/credit), งวดบัญชี + ปุ่มปิดงวด
//
// Known gap (บันทึกไว้ตรงๆ ไม่ซ่อน): ไม่มี UI สำหรับ record_ar_payment_received()/
// record_consignor_payout() (รับชำระ AR ตอน "ขายเชื่อ" จริง / จ่ายเงินคืนผู้ฝากขาย) — RPC มีอยู่
// แล้วใน DB (ดู db/accounting_module_migration.sql) แต่ยังไม่ผูก UI รอบนี้ เพราะเป็น follow-on
// event ที่การ์ดต้นทางไม่ได้ระบุ test scenario ชัดเจนเท่า sale event เอง — ต่อได้ในรอบถัดไป
function AccountingPageContent() {
  const { currentShopId, currentShop, currentRole } = useAuth();
  const canManage = currentRole === "owner" || currentRole === "manager";

  const [tierEligible, setTierEligible] = useState(true);
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [lines, setLines] = useState([]);
  const [msg, setMsg] = useState(null);
  const [closingLabel, setClosingLabel] = useState(null);

  useEffect(() => {
    if (currentShopId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function fetchAll() {
    setLoading(true);

    const tier = getTierConfig(currentShop?.subscription_plan);
    setTierEligible(hasAccountingModuleFeature(tier));

    const { data: shopRow } = await supabase
      .from("shops")
      .select("accounting_module_enabled")
      .eq("shop_id", currentShopId)
      .single();
    setModuleEnabled(!!shopRow?.accounting_module_enabled);

    const [{ data: accountsData }, { data: periodsData }, { data: entriesData }] = await Promise.all([
      supabase
        .from("accounting_accounts")
        .select("account_code, account_name, account_type, normal_balance, is_active")
        .eq("shop_id", currentShopId)
        .order("account_code"),
      supabase
        .from("accounting_periods")
        .select("period_id, period_label, period_start, period_end, status, closed_at")
        .eq("shop_id", currentShopId)
        .order("period_label", { ascending: false }),
      supabase
        .from("journal_entries")
        .select("entry_id, entry_date, description, source_type, source_table, source_id, created_at")
        .eq("shop_id", currentShopId)
        .order("entry_date", { ascending: false })
        .order("entry_id", { ascending: false })
        .limit(100),
    ]);

    setAccounts(accountsData || []);
    setPeriods(periodsData || []);
    setEntries(entriesData || []);

    const entryIds = (entriesData || []).map((e) => e.entry_id);
    if (entryIds.length > 0) {
      const { data: linesData } = await supabase
        .from("journal_entry_lines")
        .select("entry_id, account_code, debit, credit, memo")
        .in("entry_id", entryIds);
      setLines(linesData || []);
    } else {
      setLines([]);
    }

    setLoading(false);
  }

  async function handleClosePeriod(periodLabel) {
    if (!confirm(`ยืนยันปิดงวดบัญชี ${periodLabel}? หลังปิดแล้วจะบันทึกรายการใหม่เข้างวดนี้ไม่ได้อีก`)) {
      return;
    }
    setClosingLabel(periodLabel);
    setMsg(null);
    const { error } = await supabase.rpc("close_accounting_period", {
      p_shop_id: currentShopId,
      p_period_label: periodLabel,
    });
    if (error) {
      setMsg({ type: "error", text: "ปิดงวดไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: `ปิดงวด ${periodLabel} แล้ว ✅` });
      fetchAll();
    }
    setClosingLabel(null);
  }

  const linesByEntry = {};
  lines.forEach((l) => {
    (linesByEntry[l.entry_id] = linesByEntry[l.entry_id] || []).push(l);
  });

  if (!tierEligible) {
    return (
      <div className="container">
        <div className="header">
          <h1>📒 โมดูลบัญชี</h1>
          <Link href="/admin" className="nav-link secondary">
            ← กลับ
          </Link>
        </div>
        <div className="msg error">
          🔒 ฟีเจอร์นี้อยู่ในแพ็กเกจ Pro ขึ้นไป — อัปเกรดแพ็กเกจเพื่อใช้งานผังบัญชี/journal entries
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <div className="msg">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📒 โมดูลบัญชี</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {!moduleEnabled && (
        <div className="msg" style={{ marginBottom: 16 }}>
          โมดูลนี้ยังไม่ได้เปิดใช้งาน — เปิดได้ที่ <Link href="/admin">หน้าตั้งค่าระบบ</Link> (การขาย
          ยังบันทึกใน part_sales ตามปกติ ไม่มีผลกระทบใดๆ จนกว่าจะเปิด)
        </div>
      )}
      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
        <div className="card-title">ผังบัญชี (Chart of Accounts)</div>
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>รหัสบัญชี</th>
                <th style={{ textAlign: "left" }}>ชื่อบัญชี</th>
                <th style={{ textAlign: "left" }}>ประเภท</th>
                <th style={{ textAlign: "left" }}>ยอดปกติ</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={4}>ยังไม่มีผังบัญชี — จะถูกสร้างอัตโนมัติเมื่อเปิดใช้งานโมดูล</td>
                </tr>
              )}
              {accounts.map((a) => (
                <tr key={a.account_code}>
                  <td>{a.account_code}</td>
                  <td>{a.account_name}</td>
                  <td>{a.account_type}</td>
                  <td>{a.normal_balance === "debit" ? "เดบิต" : "เครดิต"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
        <div className="card-title">งวดบัญชี (Accounting Periods)</div>
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>งวด</th>
                <th style={{ textAlign: "left" }}>ช่วงวันที่</th>
                <th style={{ textAlign: "left" }}>สถานะ</th>
                {canManage && <th>การจัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3}>ยังไม่มีงวดบัญชี</td>
                </tr>
              )}
              {periods.map((p) => (
                <tr key={p.period_id}>
                  <td>{p.period_label}</td>
                  <td>
                    {p.period_start} — {p.period_end}
                  </td>
                  <td>{p.status === "closed" ? "🔒 ปิดแล้ว" : "🟢 เปิดอยู่"}</td>
                  {canManage && (
                    <td>
                      {p.status === "open" && (
                        <button
                          type="button"
                          onClick={() => handleClosePeriod(p.period_label)}
                          disabled={closingLabel === p.period_label}
                        >
                          {closingLabel === p.period_label ? "กำลังปิด..." : "ปิดงวดนี้"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
        <div className="card-title">Journal Entries (ล่าสุด 100 รายการ)</div>
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>วันที่</th>
                <th style={{ textAlign: "left" }}>รายละเอียด</th>
                <th style={{ textAlign: "left" }}>ประเภท</th>
                <th style={{ textAlign: "left" }}>บัญชี</th>
                <th style={{ textAlign: "right" }}>เดบิต</th>
                <th style={{ textAlign: "right" }}>เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6}>ยังไม่มีรายการบัญชี</td>
                </tr>
              )}
              {entries.map((e) =>
                (linesByEntry[e.entry_id] || []).map((l, idx) => (
                  <tr key={`${e.entry_id}-${idx}`}>
                    <td>{idx === 0 ? e.entry_date : ""}</td>
                    <td>{idx === 0 ? e.description : ""}</td>
                    <td>{idx === 0 ? e.source_type : ""}</td>
                    <td>{l.account_code}</td>
                    <td style={{ textAlign: "right" }}>{Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ""}</td>
                    <td style={{ textAlign: "right" }}>{Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="msg" style={{ marginTop: 16 }}>
        📌 นอกขอบเขตรอบนี้ (ตั้งใจ, ดูรายละเอียดใน Notion): Intercompany/consolidation ข้ามอู่ในเครือ
        รอ Multi-branch support ก่อน (ยัง "Not started"), และ Investor model (กิจการร่วมค้าแบ่งกำไร)
        ยังไม่ได้ออกแบบ journal — ทั้งสองยังไม่ implement ในหน้านี้
      </div>
    </div>
  );
}

export default function AccountingPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor"]}>
      <AccountingPageContent />
    </RequireAuth>
  );
}
