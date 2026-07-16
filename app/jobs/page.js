"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import RequireAuth from "../../components/RequireAuth";
import { JOB_STATUS_STYLE } from "../../lib/jobStatusLabels";

const TABS = [
  { key: "all", label: "ทั้งหมด", icon: "📋" },
  { key: "open", label: "เปิดอยู่", icon: "🔧" },
  { key: "closed", label: "ปิดแล้ว", icon: "✅" },
];

const OPEN_STATUSES = ["received", "in_progress", "waiting_parts"];
const CLOSED_STATUSES = ["completed", "delivered", "canceled"];

function JobsPageContent() {
  const { currentShopId } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("open");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (currentShopId) fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function fetchJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("shop_id", currentShopId)
      .order("created_at", { ascending: false });
    if (!error) setJobs(data || []);
    setLoading(false);
  }

  const tabFiltered = jobs.filter((j) => {
    if (activeTab === "all") return true;
    if (activeTab === "open") return OPEN_STATUSES.includes(j.status);
    return CLOSED_STATUSES.includes(j.status);
  });

  const filtered = tabFiltered.filter((j) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      j.customer_name?.toLowerCase().includes(s) ||
      j.license_plate?.toLowerCase().includes(s) ||
      j.car_brand?.toLowerCase().includes(s) ||
      j.car_model?.toLowerCase().includes(s)
    );
  });

  const openCount = jobs.filter((j) => OPEN_STATUSES.includes(j.status)).length;
  const closedCount = jobs.filter((j) => CLOSED_STATUSES.includes(j.status)).length;
  const tabCounts = { all: jobs.length, open: openCount, closed: closedCount };

  return (
      <div className="container">
      <div className="header">
        <h1>
          🔧 งานเข้าอู่ <span style={{ fontSize: 14, color: "var(--text-muted)" }}>({jobs.length})</span>
        </h1>
        <Link href="/jobs/new" className="nav-link">
          + รับงานใหม่
        </Link>
      </div>

      <div className="view-toggle" style={{ marginBottom: 12, width: "100%" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={activeTab === t.key ? "active" : ""}
            onClick={() => setActiveTab(t.key)}
            style={{ flex: 1 }}
          >
            {t.icon} {t.label} ({tabCounts[t.key]})
          </button>
        ))}
      </div>

      <div className="filters" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="ค้นหาชื่อลูกค้า / ทะเบียน / รุ่นรถ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="empty">กำลังโหลด...</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty">ไม่พบงานในหมวดนี้</div>
      )}

      {filtered.map((j) => {
        const isOpen = OPEN_STATUSES.includes(j.status);
        return (
          <Link
            href={`/jobs/${j.job_id}`}
            className="card"
            key={j.job_id}
            style={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
          >
            <div style={{ fontSize: 22 }}>{isOpen ? "🔧" : "✅"}</div>
            <div className="card-body" style={{ flex: 1 }}>
              <div className="card-title">
                {j.car_brand} {j.car_model}
                {j.license_plate ? ` · ${j.license_plate}` : ""}
              </div>
              <div className="card-sub">
                {j.customer_name || "ไม่ระบุชื่อลูกค้า"}
                {j.notes ? ` — ${j.notes}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                <span className="tag" style={{ color: JOB_STATUS_STYLE[j.status]?.color }}>
                  {JOB_STATUS_STYLE[j.status]?.label}
                </span>
                {j.source_type && <span className="tag">{j.source_type}</span>}
              </div>
            </div>
          </Link>
        );
      })}
      </div>
  );
}

export default function JobsPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <JobsPageContent />
    </RequireAuth>
  );
}
