"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import RequireAuth from "../../../components/RequireAuth";
import PartQRCode from "../../../components/PartQRCode";

function PrintLabelPageContent() {
  const params = useParams();
  const partId = params.id;

  const [part, setPart] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId]);

  async function fetchPart() {
    setLoading(true);
    const { data } = await supabase.from("parts").select("*").eq("id", partId).maybeSingle();
    setPart(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (!part) {
    return (
      <div className="container">
        <div className="empty">ไม่พบอะไหล่ชิ้นนี้</div>
      </div>
    );
  }

  return (
    <>
      <div className="container">
        <div className="header no-print">
          <h1>🏷️ พิมพ์ป้าย QR</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/edit/${partId}`} className="nav-link secondary">
              ← กลับ
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="nav-link"
              style={{ border: "none", cursor: "pointer" }}
            >
              🖨️ พิมพ์
            </button>
          </div>
        </div>

        <p className="no-print" style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          สแกนด้วยกล้องมือถือธรรมดาแล้วเปิดดูรายละเอียดอะไหล่ชิ้นนี้ได้ทันที ไม่ต้องมีแอปพิเศษ
        </p>

        <div className="label-sheet">
          <div className="label-card">
            <PartQRCode partId={part.id} size={140} />
            <div className="label-text">
              <div className="label-title">{part.part_name}</div>
              <div className="label-sub">
                {part.car_brand} {part.car_model}
              </div>
              {part.zone_code && <div className="label-sub">โซน {part.zone_code}</div>}
              <div className="label-id">#{part.id.slice(0, 8)}</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .label-sheet {
          display: flex;
          justify-content: center;
        }
        .label-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          border: 1px dashed var(--border-strong);
          border-radius: 8px;
          width: 220px;
        }
        .label-text {
          text-align: center;
        }
        .label-title {
          font-weight: 700;
          font-size: 14px;
        }
        .label-sub {
          font-size: 12px;
          color: var(--text-muted);
        }
        .label-id {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
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
          .label-card {
            border: 1px solid #999 !important;
          }
          .label-title,
          .label-sub,
          .label-id {
            color: black !important;
          }
          @page {
            size: 60mm 40mm;
            margin: 2mm;
          }
        }
      `}</style>
    </>
  );
}

export default function PrintLabelPage() {
  return (
    <RequireAuth>
      <PrintLabelPageContent />
    </RequireAuth>
  );
}
