"use client";

import { useRef, useState } from "react";

export default function SignaturePad({ onSave, saving }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPoint = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e) {
    e.preventDefault();
    drawingRef.current = true;
    lastPoint.current = getPos(e);
  }

  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = getPos(e);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasSignature(true);
  }

  function end() {
    drawingRef.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function handleSave() {
    if (!hasSignature) return;
    canvasRef.current.toBlob((blob) => onSave(blob), "image/png");
  }

  return (
    <div className="no-print">
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        style={{
          width: "100%",
          height: 180,
          border: "1px dashed var(--border-strong)",
          borderRadius: 8,
          background: "white",
          touchAction: "none",
          cursor: "crosshair",
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleClear}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ล้าง
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasSignature || saving}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontWeight: 600,
            fontSize: 13,
            cursor: hasSignature ? "pointer" : "default",
            opacity: hasSignature ? 1 : 0.5,
          }}
        >
          {saving ? "กำลังบันทึก..." : "✓ บันทึกลายเซ็น"}
        </button>
      </div>
    </div>
  );
}
