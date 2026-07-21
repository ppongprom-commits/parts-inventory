"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

// QR เก็บ URL ตรงไปหน้า /zone/[id] — สแกนด้วยกล้องมือถือธรรมดา เปิดเบราว์เซอร์
// เห็น breadcrumb ของโซนนั้นทันที พร้อมปุ่มเพิ่มอะไหล่/ย้ายอะไหล่ที่นี่
export default function ZoneQRCode({ zoneId, size = 160 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !zoneId) return;
    const url = `${window.location.origin}/zone/${zoneId}`;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [zoneId, size]);

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}
