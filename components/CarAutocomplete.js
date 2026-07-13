"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import carModels from "../lib/carModels.json";

/**
 * ค้นหารถจาก brand + model รวมกัน (พิมพ์ 2-3 ตัวอักษรก็ค้นได้)
 * เมื่อเลือกแล้วจะ callback (item) => { brand, model, year_start, year_end }
 */
export default function CarAutocomplete({ onSelect, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    return carModels
      .filter(
        (c) =>
          c.brand.toLowerCase().includes(q) || c.model.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(item) {
    onSelect(item);
    setQuery(`${item.brand} ${item.model}`);
    setOpen(false);
    setActiveIndex(-1);
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

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder || "พิมพ์ยี่ห้อหรือรุ่น เช่น Camry, Vios, D-Max"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#1a1d24",
            border: "1px solid #333844",
            borderRadius: 8,
            maxHeight: 260,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {results.map((item, i) => (
            <div
              key={`${item.brand}-${item.model}-${i}`}
              onClick={() => handleSelect(item)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                background: i === activeIndex ? "#2a2d34" : "transparent",
                borderBottom:
                  i !== results.length - 1 ? "1px solid #262a33" : "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {item.brand} {item.model}
              </div>
              <div style={{ fontSize: 12, color: "#a8adb8" }}>
                {item.vehicle_type} · {item.year_start}–{item.year_end}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#1a1d24",
            border: "1px solid #333844",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "#6b7280",
            zIndex: 20,
          }}
        >
          ไม่พบในฐานข้อมูล — พิมพ์ยี่ห้อ/รุ่นในช่องด้านล่างเองได้เลย
        </div>
      )}
    </div>
  );
}
