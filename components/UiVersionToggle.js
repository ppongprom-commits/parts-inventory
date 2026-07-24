"use client";

import { useEffect, useState } from "react";
import { getUiVersion, setUiVersion } from "../lib/uiVersionStorage";

// ปุ่มสลับ v1/v2 แบบลอยติดขอบจอ — เขียนตามแพทเทิร์นเดียวกับ app-theme-switch ใน
// components/AppShell.js (อ่าน/เขียนค่าเองภายใน แล้วเรียก onChange ให้ parent อัปเดต state
// สำหรับ re-render เท่านั้น ไม่ได้เก็บ role check ไว้ในนี้ — parent เป็นคนตัดสินใจว่าจะ render
// component นี้หรือไม่ตาม currentRole)
export default function UiVersionToggle({ onChange }) {
  const [version, setVersionState] = useState("v1");

  useEffect(() => {
    setVersionState(getUiVersion());
  }, []);

  function handleToggle() {
    const next = version === "v1" ? "v2" : "v1";
    setVersionState(next);
    setUiVersion(next);
    if (onChange) onChange(next);
  }

  const nextLabel = version === "v1" ? "v2" : "v1";

  return (
    <button
      type="button"
      className="app-ui-version-toggle"
      onClick={handleToggle}
      aria-label={version === "v1" ? "สลับไปแดชบอร์ดใหม่ (v0.2)" : "สลับกลับหน้าเดิม"}
      title={version === "v1" ? "ลองแดชบอร์ดใหม่ (v0.2)" : "กลับไปหน้าเดิม"}
    >
      <span className="app-ui-version-toggle-icon">{version === "v1" ? "✨" : "📦"}</span>
      <span className="app-ui-version-toggle-text">{nextLabel}</span>
    </button>
  );
}
