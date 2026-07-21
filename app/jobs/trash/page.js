"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";

function JobsTrashPageContent() {
  const { currentShopId } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (currentShopId) fetchTrashedJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function fetchTrashedJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("shop_id", currentShopId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (!error) setJobs(data || []);
    setLoading(false);
  }

  async function handleRestore(job) {
    setBusyId(job.job_id);
    setMsg(null);
    const { error } = await supabase.from("jobs").update({ deleted_at: null }).eq("job_id", job.job_id);
    if (error) {
      setMsg({ type: "error", text: "กู้คืนไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: `กู้คืนงานของ "${job.customer_name || "ลูกค้า"}" แล้ว ✅` });
      fetchTrashedJobs();
    }
    setBusyId(null);
  }

  async function handlePurge(job) {
    const confirmed = window.confirm(
      `ลบถาวรงานของ "${job.customer_name || "ลูกค้า"}" ใช่ไหม? กู้คืนไม่ได้อีกแล้ว`
    );
    if (!confirmed) return;

    setBusyId(job.job_id);
    setMsg(null);
    const { error } = await supabase.from("jobs").delete().eq("job_id", job.job_id);
    if (error) {
      setMsg({ type: "error", text: "ลบถาวรไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "ลบถาวรแล้ว" });
      fetchTrashedJobs();
    }
    setBusyId(null);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>
          🗑️ ถังขยะงาน <span style={{ fontSize: 14, color: "var(--text-muted)" }}>({jobs.length})</span>
        </h1>
        <Link href="/jobs" className="nav-link secondary">
          ← กลับไปรายการงาน
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      {loading && <div className="empty">กำลังโหลด...</div>}
      {!loading && jobs.length === 0 && <div className="empty">ถังขยะว่างเปล่า</div>}

      {jobs.map((j) => (
        <div className="card" key={j.job_id} style={{ alignItems: "center" }}>
          <div style={{ fontSize: 22 }}>🗑️</div>
          <div className="card-body" style={{ flex: 1 }}>
            <div className="card-title">
              {j.car_brand} {j.car_model}
              {j.license_plate ? ` · ${j.license_plate}` : ""}
            </div>
            <div className="card-sub">
              {j.customer_name || "ไม่ระบุชื่อลูกค้า"} — ลบเมื่อ {new Date(j.deleted_at).toLocaleString("th-TH")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => handleRestore(j)}
              disabled={busyId === j.job_id}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ♻️ กู้คืน
            </button>
            <button
              type="button"
              onClick={() => handlePurge(j)}
              disabled={busyId === j.job_id}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--danger, #dc2626)",
                background: "transparent",
                color: "var(--danger, #dc2626)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ลบถาวร
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JobsTrashPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager"]}>
      <JobsTrashPageContent />
    </RequireAuth>
  );
}
