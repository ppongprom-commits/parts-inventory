"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import RequireAuth from "../../components/RequireAuth";
import ZoneQRCode from "../../components/ZoneQRCode";
import { formatBreadcrumb } from "../../lib/zoneHelpers";

function PrintZoneLabelsPageContent() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);

  const [zones, setZones] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchZones() {
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    // ดึงโซนทั้งร้าน (ไม่ใช่แค่ ids ที่เลือก) เพื่อคำนวณ breadcrumb ให้ถูก แม้ parent จะไม่ได้ถูกเลือกพิมพ์ด้วย
    const { data: firstZone } = await supabase.from("zones").select("shop_id").eq("id", ids[0]).maybeSingle();
    if (!firstZone) {
      setLoading(false);
      return;
    }
    const { data: allZones } = await supabase.from("zones").select("*").eq("shop_id", firstZone.shop_id);
    setZones(allZones || []);
    const ordered = ids.map((id) => allZones?.find((z) => z.id === id)).filter(Boolean);
    setSelectedZones(ordered);
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
          <h1>🏷️ พิมพ์ป้าย QR โซน ({selectedZones.length})</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/zones" className="nav-link secondary">
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

        {selectedZones.length === 0 && <div className="empty">ไม่พบโซนที่เลือก</div>}

        <div className="label-grid">
          {selectedZones.map((zone) => (
            <div className="label-card" key={zone.id}>
              <ZoneQRCode zoneId={zone.id} size={110} />
              <div className="label-text">
                <div className="label-title">{zone.code}</div>
                <div className="label-sub">{formatBreadcrumb(zones, zone.id)}</div>
                {zone.name && <div className="label-sub">{zone.name}</div>}
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
          .label-sub {
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

export default function PrintZoneLabelsPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager"]}>
      <Suspense fallback={<div className="container">กำลังโหลด...</div>}>
        <PrintZoneLabelsPageContent />
      </Suspense>
    </RequireAuth>
  );
}
