"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import RequireAuth from "../../components/RequireAuth";
import PartQRCode from "../../components/PartQRCode";

function PrintLabelsPageContent() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);

  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchParts() {
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("parts").select("*").in("id", ids);
    // เรียงตามลำดับ id ที่เลือกไว้ตอนแรก ไม่ใช่ลำดับที่ query คืนมา
    const ordered = ids.map((id) => data?.find((p) => p.id === id)).filter(Boolean);
    setParts(ordered);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <>
      <div className="container">
        <div className="header no-print">
          <h1>🏷️ พิมพ์ป้าย QR ({parts.length} ชิ้น)</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/" className="nav-link secondary">
              ← กลับ
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="nav-link"
              style={{ border: "none", cursor: "pointer" }}
            >
              🖨️ พิมพ์ทั้งหมด
            </button>
          </div>
        </div>

        {parts.length === 0 && <div className="empty">ไม่พบอะไหล่ที่เลือก</div>}

        <div className="label-grid">
          {parts.map((part) => (
            <div className="label-card" key={part.id}>
              <PartQRCode partId={part.id} size={110} />
              <div className="label-text">
                <div className="label-title">{part.part_name}</div>
                <div className="label-sub">
                  {part.car_brand} {part.car_model}
                </div>
                {part.zone_code && <div className="label-sub">โซน {part.zone_code}</div>}
                <div className="label-id">#{part.id.slice(0, 8)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .label-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .label-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px;
          border: 1px dashed var(--border-strong);
          border-radius: 8px;
        }
        .label-text {
          text-align: center;
        }
        .label-title {
          font-weight: 700;
          font-size: 12px;
        }
        .label-sub {
          font-size: 10px;
          color: var(--text-muted);
        }
        .label-id {
          font-size: 9px;
          color: var(--text-muted);
          margin-top: 2px;
          font-family: monospace;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .label-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .label-card {
            border: 1px solid #999 !important;
            break-inside: avoid;
          }
          .label-title,
          .label-sub,
          .label-id {
            color: black !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>
    </>
  );
}

export default function PrintLabelsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="container">กำลังโหลด...</div>}>
        <PrintLabelsPageContent />
      </Suspense>
    </RequireAuth>
  );
}
