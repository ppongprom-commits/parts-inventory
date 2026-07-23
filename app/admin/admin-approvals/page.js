"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { ACTION_TYPE_LABELS } from "../../../config/adminApprovalDefaults";

// การ์ด "Admin Role (7th role) — Maker-Checker Approval Config" (23 ก.ค. 2026)
// คิว "รออนุมัติ" — เห็นได้เฉพาะ owner/manager/admin (ตรงกับ RLS ของ pending_admin_actions)
// การอนุมัติ/ปฏิเสธเรียกผ่าน RPC decide_pending_admin_action() ตรงๆ จาก client (pattern เดียวกับ
// update_member_role() ใน app/admin/team/page.js — ไม่ต้องมี API route คั่นกลาง เพราะ auth.uid()
// resolve จาก session ของผู้เรียกได้เลย, RLS/RPC เป็นชั้นป้องกันจริงอยู่แล้ว)
//
// action_type ที่มีการ replay การกระทำจริงตอนอนุมัติ (ตอนนี้มีแค่ import_customers ที่ wire จริง —
// ที่เหลือยังไม่มีฟีเจอร์ต้นทางให้ทำ ไม่มีทางมีแถวเกิดขึ้นจริงในตารางนี้)
async function applyApprovedAction(action) {
  if (action.action_type === "import_customers") {
    const rows = action.payload?.rows || [];
    if (rows.length === 0) return { ok: true };
    const { error } = await supabase.from("customers").insert(rows);
    if (error) return { ok: false, error: error.message };
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

    const userIds = [...new Set((data || []).map((d) => d.performed_by))];
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

    if (decision === "approved") {
      const applyResult = await applyApprovedAction(decided);
      if (!applyResult.ok) {
        setError(`อนุมัติแล้วแต่ทำรายการจริงไม่สำเร็จ: ${applyResult.error} — ต้องแก้ไขด้วยมือ`);
      }
    }

    setItems((prev) => prev.filter((i) => i.id !== actionId));
    setDecidingId(null);
  }

  function summarizePayload(item) {
    if (item.action_type === "import_customers") {
      return `นำเข้าลูกค้า ${item.payload?.rows?.length || 0} รายชื่อ`;
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
    </div>
  );
}

export default function AdminApprovalsQueuePage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "admin"]}>
      <AdminApprovalsQueueContent />
    </RequireAuth>
  );
}
