"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import RequireAuth from "../../components/RequireAuth";
import ZoneQRCode from "../../components/ZoneQRCode";
import { formatBreadcrumb, formatBreadcrumbShort } from "../../lib/zoneHelpers";

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
        <div className="no-print" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
          ตั้งค่าเครื่องพิมพ์ label (เช่น EasyPrint ES-9920UX): เลือกขนาดกระดาษ 40 × 60 มม. margin 0 ก่อนกดพิมพ์ —
          พิมพ์ทีละดวงต่อป้ายจริงอัตโนมัติ ไม่ใช่กระดาษ A4
        </div>

        {selectedZones.length === 0 && <div className="empty">ไม่พบโซนที่เลือก</div>}

        <div className="label-grid">
          {selectedZones.map((zone) => (
            <div className="label-card" key={zone.id}>
              <div className="label-qr">
                <ZoneQRCode zoneId={zone.id} size={110} />
              </div>
              <div className="label-text">
                <div className="label-title">{zone.code}</div>
                {/* หน้าจอปกติ: breadcrumb เต็ม (ไว้ตรวจสอบก่อนพิมพ์) — ตอนพิมพ์จริงใช้ short
                   breadcrumb (.print-only) แทน เพื่อเปิดพื้นที่ให้ zone code ตัวใหญ่ขึ้น อ่านง่ายขึ้น */}
                <div className="label-sub no-print-inline">{formatBreadcrumb(zones, zone.id)}</div>
                <div className="label-sub print-only">{formatBreadcrumbShort(zones, zone.id, 2)}</div>
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
        .print-only {
          display: none;
        }

        /* โหมดพิมพ์จริง — เครื่องพิมพ์ label ความร้อน (เช่น EasyPrint ES-9920UX)
           ป้ายจริงขนาด 40 x 60 มม. ม้วนต่อเนื่อง ตัดทีละดวงด้วยเซ็นเซอร์ —
           1 การ์ด = 1 หน้ากระดาษ = 1 ดวงจริง ไม่ใช่ grid หลายคอลัมน์แบบ A4 */
        @media print {
          .no-print {
            display: none !important;
          }
          .no-print-inline {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          @page {
            size: 40mm 60mm;
            margin: 2mm;
          }
          .label-grid {
            display: block;
          }
          .label-card {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            border: none !important;
            border-radius: 0;
            padding: 0;
            justify-content: center;
            page-break-after: always;
            break-after: page;
          }
          .label-card:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .label-qr canvas {
            width: 26mm !important;
            height: 26mm !important;
          }
          /* เดิม 10pt เล็กเกินไป อ่านยากจากระยะ ~50-70cm หน้าชั้นจริง — ขยายเป็น 20pt
             (บั๊กเดิมจากคืน 20 ก.ค. 2026) ลด QR ลงเล็กน้อย (30mm→26mm) เปิดพื้นที่ตัวหนังสือ */
          .label-title {
            font-size: 20pt;
            font-weight: 800;
            color: black !important;
          }
          .label-sub {
            font-size: 9pt;
            color: black !important;
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
