"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { SESSION_ID_HEADER, getStoredSessionId } from "../../../lib/sessionTracking";
import { getTierConfig, isUnlimited } from "../../../config/subscriptionTiers";

// การ์ด "Multi-branch support (Pro=2 สาขา, Enterprise=ไม่จำกัด)" — Notion
// 3a1f39f45649810cb1fffbfa5da1d799
//
// หน้านี้ = จุดเดียวที่ owner/manager สร้างสาขาเพิ่ม (ตาม tier limit) และดูรายชื่อสาขาทั้งหมด +
// สลับสถานะ read-only ของสาขา (ใช้ตอน downgrade Enterprise→Pro ขณะมีสาขาเกิน limit — เจ้าของ
// ร้านเลือกเองว่าจะเก็บสาขาไหนเป็น active)
//
// ✅ enforce ทั้ง 2 ชั้นตาม convention ของโปรเจกต์นี้: ซ่อนปุ่ม "+ สร้างสาขา" ที่ UI เมื่อถึง limit
// แล้ว (ชั้น UI) + app/api/branches (POST) เช็คซ้ำอีกที (ชั้น API, 400) + DB trigger
// trg_branches_tier_limit เช็คอีกชั้น (ชั้น DB, defense-in-depth สุดท้าย)
function BranchesPageContent() {
  const { currentShopId, currentRole, currentShop } = useAuth();
  const canManage = currentRole === "owner" || currentRole === "manager";

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newBranchName, setNewBranchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const tier = getTierConfig(currentShop?.subscription_plan);
  const activeBranchCount = branches.filter((b) => b.is_active).length;
  const atOrOverLimit = !isUnlimited(tier.maxBranches) && activeBranchCount >= tier.maxBranches;

  useEffect(() => {
    if (currentShopId) fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      [SESSION_ID_HEADER]: getStoredSessionId() || "",
    };
  }

  async function fetchBranches() {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/branches?shop_id=${currentShopId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "โหลดรายชื่อสาขาไม่สำเร็จ");
      setBranches(json.branches || []);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBranch(e) {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    setBusy(true);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/branches", {
        method: "POST",
        headers,
        body: JSON.stringify({ shop_id: currentShopId, branch_name: newBranchName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "สร้างสาขาไม่สำเร็จ");

      setNewBranchName("");
      setMsg({ type: "success", text: `สร้างสาขา "${json.data.branch_name}" สำเร็จ ✅` });
      await fetchBranches();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleReadOnly(branch) {
    setBusy(true);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/branches/${branch.branch_id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ is_read_only: !branch.is_read_only }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "แก้ไขไม่สำเร็จ");
      await fetchBranches();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="card">
        <div className="card-body">เฉพาะเจ้าของ/ผู้จัดการเท่านั้นที่จัดการสาขาได้</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="card-body" style={{ width: "100%" }}>
          <div className="card-title">🏬 จัดการสาขา</div>
          <div className="card-sub">
            แพ็กเกจปัจจุบัน: {tier.label} — สาขาที่ใช้งานอยู่ {activeBranchCount}/
            {isUnlimited(tier.maxBranches) ? "ไม่จำกัด" : tier.maxBranches}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === "error" ? "danger" : "success"}`}>{msg.text}</div>
      )}

      {loading ? (
        <div>กำลังโหลด...</div>
      ) : (
        <div className="card" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div className="card-body" style={{ width: "100%" }}>
            <table style={{ width: "100%", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>สาขา</th>
                  <th style={{ textAlign: "left" }}>รหัส</th>
                  <th style={{ textAlign: "left" }}>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch_id} data-testid={`branch-row-${b.branch_id}`}>
                    <td>
                      {b.branch_name}
                      {b.is_default && " (สาขาหลัก)"}
                    </td>
                    <td>{b.branch_code}</td>
                    <td>
                      {b.is_read_only ? (
                        <span style={{ color: "var(--danger, #c0392b)" }}>⚠️ read-only</span>
                      ) : (
                        <span style={{ color: "var(--success, #2e7d32)" }}>ใช้งานได้</span>
                      )}
                    </td>
                    <td>
                      {!b.is_default && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleReadOnly(b)}
                          data-testid={`toggle-readonly-${b.branch_id}`}
                        >
                          {b.is_read_only ? "เปิดใช้งานกลับ" : "ตั้งเป็น read-only"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="card-body" style={{ width: "100%" }}>
          <div className="card-title">+ สร้างสาขาใหม่</div>
          {atOrOverLimit ? (
            <div className="alert alert-warning" data-testid="branch-limit-reached">
              จำนวนสาขาถึงขีดจำกัดของแพ็กเกจ {tier.label} แล้ว (สูงสุด {tier.maxBranches} สาขา) —
              อัปเกรดแพ็กเกจเพื่อเพิ่มสาขาได้
            </div>
          ) : (
            <form onSubmit={handleCreateBranch} style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                type="text"
                placeholder="ชื่อสาขา เช่น สาขาบางนา"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                data-testid="new-branch-name-input"
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={busy} data-testid="create-branch-submit">
                สร้างสาขา
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BranchesPage() {
  return (
    <RequireAuth>
      <BranchesPageContent />
    </RequireAuth>
  );
}
