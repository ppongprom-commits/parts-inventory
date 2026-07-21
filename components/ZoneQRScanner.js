"use client";

import { useEffect, useRef, useState } from "react";
import { isLeaf } from "../lib/zoneHelpers";

// การ์ด "🌙 งานที่ต้องทำคืนนี้" ข้อ 1 — เพิ่มปุ่ม "สแกนตำแหน่งแทน" ในหน้า /add และ /edit
// เพื่อสแกน QR โซน (ZoneQRCode.js เก็บ URL รูปแบบ `${origin}/zone/<uuid>`) แล้ว auto-fill
// zone_id ให้ทันที ไม่ต้องอ้อมไป /zone/[id] ก่อนแล้วค่อยกด "เพิ่มอะไหล่ที่นี่" แบบเดิม
//
// ขอบเขตรอบนี้: ปุ่มนี้เป็น "ทางเลือกเสริม" เสมอ (optional) — ส่วน toggle "บังคับสแกน QR
// ยืนยันตำแหน่ง" ระดับร้าน (จากการ์ด "ย้ายอะไหล่ระหว่าง Zone" ที่ยังไม่เริ่มทำ) ยังไม่ implement
// ที่นี่ เพราะการ์ดต้นทางของ toggle นั้นยังไม่ถูกสร้าง — ทำตอนการ์ดนั้นถึงคิว

/** แกะ zone id (uuid) จาก URL ที่ QR โซนเก็บอยู่ — ใช้ทั้งในคอมโพเนนต์นี้และเทส */
export function parseZoneIdFromScannedText(text) {
  if (!text) return null;
  const match = String(text).match(
    /\/zone\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/
  );
  return match ? match[1] : null;
}

export default function ZoneQRScanner({ zones, onScan, buttonLabel = "📷 สแกนตำแหน่งแทน" }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError("");

    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setSupported(false);
      return undefined;
    }
    setSupported(true);

    let cancelled = false;
    let rafId = null;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    function handleDetected(rawValue) {
      const zoneId = parseZoneIdFromScannedText(rawValue);
      if (!zoneId) {
        setError("QR นี้ไม่ใช่ QR ตำแหน่งโซนของระบบ");
        return false;
      }
      const zone = (zones || []).find((z) => z.id === zoneId);
      if (!zone) {
        setError("ไม่พบโซนนี้ในระบบ (QR อาจเก่าเกินไป หรือโซนถูกลบไปแล้ว)");
        return false;
      }
      // ห้าม auto-fill โซนที่ไม่ใช่ leaf เด็ดขาด — เคยเป็นบั๊กจริงมาก่อนที่ /add?zone_id=
      if (!isLeaf(zones, zoneId)) {
        setError("โซนนี้ยังมีโซนย่อยข้างในอยู่ — กรุณาสแกน QR ของชั้น/ตำแหน่งที่ลึกที่สุด");
        return false;
      }
      onScan(zoneId);
      return true;
    }

    async function scanLoop() {
      if (cancelled || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const done = handleDetected(codes[0].rawValue);
          if (done) {
            setOpen(false);
            return;
          }
        }
      } catch {
        // เฟรมยังไม่พร้อม/detect ล้มเหลวชั่วคราว — ลองรอบถัดไป ไม่ถือเป็น error ถาวร
      }
      if (!cancelled) rafId = requestAnimationFrame(scanLoop);
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // ไม่ await play() ตรงนี้ — บาง environment (เช่น fake/no-signal stream ใน headless
          // test) play() ค้างไม่ resolve เลย ทำให้ scanLoop ไม่เริ่มสักที (defect เจอรอบ 1)
          videoRef.current.play().catch(() => {});
        }
        scanLoop();
      } catch {
        setError("เปิดกล้องไม่ได้ — ตรวจสอบสิทธิ์การใช้กล้องของเบราว์เซอร์");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="secondary"
        data-testid="zone-scan-button"
        onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start" }}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="สแกน QR ตำแหน่งโซน"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ color: "#fff", marginBottom: 12, fontSize: 14 }}>📷 เล็งกล้องไปที่ QR โซน</div>

          {supported ? (
            <video
              ref={videoRef}
              data-testid="zone-scan-video"
              muted
              playsInline
              style={{ width: "100%", maxWidth: 360, borderRadius: 8, background: "#000" }}
            />
          ) : (
            <div data-testid="zone-scan-unsupported" style={{ color: "#fff", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
              เบราว์เซอร์นี้ยังไม่รองรับการสแกน QR ในแอป — กรุณาพิมพ์ค้นหาโซนแทน หรือเปิดกล้องมือถือ
              สแกน QR แล้วเปิดลิงก์ตรง
            </div>
          )}

          {error && (
            <div data-testid="zone-scan-error" style={{ color: "#ff8080", fontSize: 13, marginTop: 10, textAlign: "center", maxWidth: 320 }}>
              {error}
            </div>
          )}

          <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 16 }}>
            ยกเลิก
          </button>
        </div>
      )}
    </>
  );
}
