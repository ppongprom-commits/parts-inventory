"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { ACTION_TYPE_LABELS } from "../../../config/adminApprovalDefaults";

// การ์ด "Admin Role (7th role) — Maker-Checker Approval Config" (23 ก.ค. 2026)
// คิว "รออนุมัติ" — เห็นได้เฉพาะ owner/manager/admin/supervisor (ตรงกับ RLS ของ pending_admin_actions
// — เพิ่ม supervisor เข้า allowedRoles ด้านล่างตอนแก้การ์ด "ขายอะไหล่ที่ยังไม่ตีราคา" 24 ก.ค. 2026:
// พบว่าหน้าตั้งค่า (settings/admin-approvals) เสนอ approver_role="supervisor" เป็นตัวเลือกได้อยู่แล้ว
// แต่หน้านี้ (ที่ใช้กดอนุมัติจริง) ไม่เคยอนุญาต supervisor เข้าเลยตั้งแต่แรก — ถ้าร้านตั้ง
// approver_role="supervisor" ไว้ supervisor จะกดอนุมัติไม่ได้เพราะเข้าหน้านี้ไม่ได้ตั้งแต่ต้น (บั๊ก
// เดิมที่ไม่เคยมี action_type ไหนใช้ supervisor จริงจนกระทบ ตอนนี้ฟีเจอร์ใหม่ "ขายอะไหล่ที่ยังไม่ตี
// ราคา" มีโอกาสสูงที่ร้านจะตั้ง supervisor เป็นผู้อนุมัติจริง เพราะ checkout เป็น role นี้ทำได้ปกติ)
// การอนุมัติ/ปฏิเสธเรียกผ่าน RPC decide_pending_admin_action() ตรงๆ จาก client (pattern เดียวกับ
// update_member_role() ใน app/admin/team/page.js — ไม่ต้องมี API route คั่นกลาง เพราะ auth.uid()
// resolve จาก session ของผู้เรียกได้เลย, RLS/RPC เป็นชั้นป้องกันจริงอยู่แล้ว)
//
// action_type ที่มีการ replay การกระทำจริงตอนอนุมัติ:
//   - import_customers: insert ตรงเข้า customers ตอนอนุมัติเท่านั้น (ของเดิม)
//   - sell_unpriced_part (ใหม่ 24 ก.ค. 2026): **ต่างจาก import_customers ตรงที่ตัวการขายทำไปแล้ว
//     จริงตั้งแต่ตอน checkout** (ตัดสต็อกแล้ว, มี part_sales row สถานะ pending_approval แล้ว) —
//     ตอนอนุมัติ/ปฏิเสธแค่พลิกสถานะ part_sales.approval_status ให้ตรง ไม่มีอะไรต้อง insert ใหม่
//     (approved -> นับเข้ารายงานได้ปกติ, rejected -> ยังนับเป็นขายแล้วเหมือนเดิมตามมติการ์ด
//     "คงขายไว้แต่แจ้งเจ้าของ" ไม่ reverse stock ใดๆ ทั้งสิ้น)
async function applyDecisionSideEffects(action, decision) {
  if (action.action_type === "import_customers") {
    if (decision !== "approved") return { ok: true };
    const rows = action.payload?.rows || [];
    if (rows.length === 0) return { ok: true };
    const { error } = await supabase.from("customers").insert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (action.action_type === "sell_unpriced_part") {
    const saleId = action.payload?.sale_id;
    if (!saleId) return { ok: true };
    const { error } = await supabase
      .from("part_sales")
      .update({ approval_status: decision === "approved" ? "approved" : "rejected" })
      .eq("sale_id", saleId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: true };
}

function AdminApprovalsQueueContent() {
  const { currentShopId } = useAuth();
  const [items, setItems] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);
  const [error, setError] = useState(null);

  // รายการขายอะไหล่ไม่มีราคาที่ถูก "ปฏิเสธ" แล้ว แต่เจ้าของยังไม่ได้ "รับทราบ" — สร้างขึ้นมาแทน
  // การ์ดที่ตัดสินใจไว้ว่า "คงขายไว้แต่แจ้งเจ้าของ" (ไม่ reverse stock) จำเป็นต้องมีที่ให้เจ้าของมาดู
  // ว่ามีรายการแบบนี้ค้างอยู่ — สร้างแบบเรียบง่ายที่สุดในหน้าเดียวกับคิวอนุมัติ (ไม่แยกหน้าใหม่ เพราะ
  // การ์ด Stock Value Cap Engine's "รายการอะไหล่ที่ยังไม่มีมูลค่า" ยังไม่มีอยู่จริงในโค้ด ตรวจแล้ว)
  const [rejectedSales, setRejectedSales] = useState([]);
  const [ackingId, setAckingId] = useState(null);

  const loadPending = useCallback(async () => {
    if (!currentShopId) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("pending_admin_actions")
      .select("id, action_type, performed_by, payload, status, created_at")
      .eq("shop_id", currentShopId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }
    setItems(data || []);

    const { data: rejected, error: rejectedError } = await supabase
      .from("part_sales")
      .select("sale_id, part_id, quantity_sold, sale_price, sold_by, sold_at, parts(part_name)")
      .eq("shop_id", currentShopId)
      .eq("approval_status", "rejected")
      .is("rejection_ack_at", null)
      .order("sold_at", { ascending: false });
    if (rejectedError) setError((prev) => prev || rejectedError.message);
    setRejectedSales(rejected || []);

    const userIds = [
      ...new Set([
        ...(data || []).map((d) => d.performed_by),
        ...(rejected || []).map((r) => r.sold_by),
      ]),
    ].filter(Boolean);
    if (userIds.length > 0) {
      const { data: members } = await supabase
        .from("shop_members")
        .select("user_id, contact_name, login_username")
        .eq("shop_id", currentShopId)
        .in("user_id", userIds);
      const map = {};
      (members || []).forEach((m) => {
        map[m.user_id] = m.contact_name || m.login_username || m.user_id;
      });
      setNames(map);
    }
    setLoading(false);
  }, [currentShopId]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function handleDecide(actionId, decision) {
    setDecidingId(actionId);
    setError(null);

    const { data: decided, error: rpcError } = await supabase.rpc("decide_pending_admin_action", {
      p_action_id: actionId,
      p_decision: decision,
    });

    if (rpcError) {
      setError(rpcError.message);
      setDecidingId(null);
      return;
    }

    const sideEffect = await applyDecisionSideEffects(decided, decision);
    if (!sideEffect.ok) {
      setError(`${decision === "approved" ? "อนุมัติ" : "ปฏิเสธ"}แล้วแต่ทำรายการจริงไม่สำเร็จ: ${sideEffect.error} — ต้องแก้ไขด้วยมือ`);
    }

    setItems((prev) => prev.filter((i) => i.id !== actionId));
    if (decided?.action_type === "sell_unpriced_part" && decision === "rejected" && sideEffect.ok) {
      loadPending();
    }
    setDecidingId(null);
  }

  async function handleAcknowledgeRejected(saleId) {
    setAckingId(saleId);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error: ackError } = await supabase
      .from("part_sales")
      .update({ rejection_ack_at: new Date().toISOString(), rejection_ack_by: userData?.user?.id || null })
      .eq("sale_id", saleId);
    if (ackError) {
      setError(ackError.message);
    } else {
      setRejectedSales((prev) => prev.filter((r) => r.sale_id !== saleId));
    }
    setAckingId(null);
  }

  function summarizePayload(item) {
    if (item.action_type === "import_customers") {
      return `นำเข้าลูกค้า ${item.payload?.rows?.length || 0} รายชื่อ`;
    }
    if (item.action_type === "sell_unpriced_part") {
      const p = item.payload || {};
      return `ขาย "${p.part_name || p.part_id}" จำนวน ${p.quantity_sold ?? "-"} @ ${p.sale_price ?? "-"} บาท (ไม่มีราคาอ้างอิงในสต็อก)`;
    }
    return JSON.stringify(item.payload);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🕒 รออนุมัติ</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="msg error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="empty">ไม่มีรายการรออนุมัติ</div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            data-testid={`pending-action-${item.id}`}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {ACTION_TYPE_LABELS[item.action_type] || item.action_type}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
              {summarizePayload(item)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              ขอโดย {names[item.performed_by] || item.performed_by} •{" "}
              {new Date(item.created_at).toLocaleString("th-TH")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={decidingId === item.id}
                onClick={() => handleDecide(item.id, "approved")}
              >
                ✅ อนุมัติ
              </button>
              <button
                type="button"
                disabled={decidingId === item.id}
                onClick={() => handleDecide(item.id, "rejected")}
              >
                ❌ ปฏิเสธ
              </button>
            </div>
          </div>
        ))
      )}

      {/* การ์ด "ขายอะไหล่ที่ยังไม่ตีราคา..." — มติ: ปฏิเสธแล้วไม่คืนสต็อก แค่แจ้งเจ้าของ */}
      {!loading && rejectedSales.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>❌ ขายอะไหล่ไม่มีราคาที่ถูกปฏิเสธ — ต้องตรวจสอบ</h3>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            รายการเหล่านี้ขายสำเร็จแล้วจริง (สต็อกถูกตัดแล้ว ไม่ได้คืน) แต่ผู้อนุมัติปฏิเสธราคา —
            ตรวจสอบแล้วกด &quot;รับทราบ&quot; เพื่อเอาออกจากรายการนี้
          </div>
          {rejectedSales.map((s) => (
            <div
              key={s.sale_id}
              data-testid={`rejected-sale-${s.sale_id}`}
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {s.parts?.part_name || s.part_id} — {s.quantity_sold} ชิ้น @ {s.sale_price} บาท
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                ขายโดย {names[s.sold_by] || s.sold_by} • {new Date(s.sold_at).toLocaleString("th-TH")}
              </div>
              <button
                type="button"
                disabled={ackingId === s.sale_id}
                onClick={() => handleAcknowledgeRejected(s.sale_id)}
              >
                ✅ รับทราบแล้ว
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function AdminApprovalsQueuePage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "admin", "supervisor"]}>
      <AdminApprovalsQueueContent />
    </RequireAuth>
  );
}
