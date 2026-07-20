"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLeafZones, formatBreadcrumb } from "../lib/zoneHelpers";

/**
 * ค้นหาโซนจัดเก็บแบบพิมพ์ค้นหา (เหมือน CarAutocomplete) แทนการไล่ dropdown ทีละชั้น
 * ค้นได้เฉพาะ "โซนปลายทาง" (leaf) เท่านั้น เพราะเป็นจุดเดียวที่เลือกใช้จริงได้
 * (กติกาเดิม: ถ้าอู่แบ่งลึกแค่ไหน ต้องเลือกให้ถึงระดับนั้น — leaf ก็คือจุดที่แบ่งลึกสุดแล้ว)
 *
 * props:
 *  - zones: array ของ zones ทั้งหมดของร้าน (flat, มี id/parent_id/code/name) — โหลดมาแล้วจาก parent
 *  - value: zone_id ที่เลือกอยู่ตอนนี้ (หรือ null)
 *  - onChange(zoneId | null)
 *  - placeholder
 */
export default function ZoneAutocomplete({ zones, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const skipNextSyncRef = useRef(false);

  // leaf zones พร้อม breadcrumb ข้อความเต็ม เช่น "โกดัง › ห้องสต๊อก › Shelf 03 › ชั้น 2"
  const leafOptions = useMemo(() => {
    return getLeafZones(zones).map((z) => ({
      id: z.id,
      breadcrumb: formatBreadcrumb(zones, z.id),
    }));
  }, [zones]);

  // sync query จาก value ที่ parent ส่งมา (เช่นตอนโหลดข้อมูลอะไหล่เดิมมาแก้ไข)
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (value) {
      const match = leafOptions.find((o) => o.id === value);
      setQuery(match ? match.breadcrumb : "");
    } else {
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, leafOptions]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return leafOptions.slice(0, 15);

    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return leafOptions
      .filter((o) => {
        const hay = o.breadcrumb.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 15);
  }, [query, leafOptions]);

  function handleSelect(option) {
    onChange(option.id);
    skipNextSyncRef.current = true;
    setQuery(option.breadcrumb);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(e) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    setActiveIndex(-1);
    if (v.trim().length === 0) onChange(null);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (leafOptions.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        ยังไม่มีโซนในระบบ
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder || "พิมพ์ค้นหาโซน เช่น Shelf 03 ชั้น 2"}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{ width: "100%", boxSizing: "border-box" }}
      />

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            maxHeight: 260,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {results.map((option, i) => (
            <div
              key={option.id}
              onClick={() => handleSelect(option)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                fontSize: 14,
                background: i === activeIndex ? "var(--surface-alt)" : "transparent",
                borderBottom:
                  i !== results.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {option.breadcrumb}
            </div>
          ))}
        </div>
      )}

      {open && query.trim().length > 0 && results.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--text-muted)",
            zIndex: 20,
          }}
        >
          ไม่พบโซนที่ตรงกับคำค้นหา
        </div>
      )}
    </div>
  );
}
