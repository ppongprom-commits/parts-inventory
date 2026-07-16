"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

// QR เก็บ URL ตรงไปหน้าแก้ไขอะไหล่ชิ้นนั้นเลย — สแกนด้วยกล้องมือถือธรรมดา
// (ไม่ต้องมีแอปสแกนพิเศษ) เปิดเบราว์เซอร์แล้วเห็นรายละเอียดอะไหล่ทันที
export default function PartQRCode({ partId, size = 160 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !partId) return;
    const url = `${window.location.origin}/edit/${partId}`;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [partId, size]);

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}
