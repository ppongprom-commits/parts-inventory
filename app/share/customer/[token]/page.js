"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS = {
  received: "รับเรื่องแล้ว",
  in_progress: "กำลังซ่อม",
  waiting_parts: "รออะไหล่",
  completed: "ซ่อมเสร็จแล้ว",
  delivered: "ส่งมอบแล้ว",
  canceled: "ยกเลิก",
};

export default function CustomerJobsPage() {
  const params = useParams();
  const token = params.token;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchData() {
    setLoading(true);
    const res = await fetch(`/api/public/customer/${token}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "เกิดข้อผิดพลาด");
    } else {
      setData(json.data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="msg error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🔧 {data.shop_name}</h1>
      </div>

      <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
        สวัสดีคุณ {data.customer_name || "ลูกค้า"} — รายการซ่อมของคุณทั้งหมด
      </p>

      {data.jobs.length === 0 && <div className="empty">ยังไม่มีประวัติงานซ่อม</div>}

      {data.jobs.map((j) => (
        <Link
          href={`/share/customer/${token}/job/${j.job_id}`}
          className="card"
          key={j.job_id}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          {j.photo_urls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={j.photo_urls[0]} alt={j.license_plate || "รถ"} />
          ) : (
            <div className="no-photo">ไม่มีรูป</div>
          )}
          <div className="card-body">
            <div className="card-title">
              {j.car_brand} {j.car_model} {j.license_plate ? `· ${j.license_plate}` : ""}
            </div>
            <div className="card-sub">{j.car_year_display}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="tag">{STATUS_LABELS[j.status] || j.status}</span>
              {j.source_type && <span className="tag">{j.source_type}</span>}
            </div>
            <div className="card-sub" style={{ marginTop: 4 }}>
              ค่าใช้จ่ายรวม: {Number(j.total_cost).toLocaleString()} บาท
            </div>
            <div className="card-sub" style={{ fontSize: 12 }}>
              รับเข้าเมื่อ {new Date(j.created_at).toLocaleDateString("th-TH")}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
