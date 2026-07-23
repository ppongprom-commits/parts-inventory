"use client";

import { useState } from "react";

const CATEGORY_LABELS = { labor: "ค่าแรง", parts: "ค่าอะไหล่", other: "อื่นๆ" };

function emptyItem() {
  return {
    category: "parts",
    item_group_label: "",
    description: "",
    default_amount: "",
    is_price_locked: true,
    variants: [],
  };
}

function emptyVariant() {
  return { variant_label: "", description: "", default_amount: "" };
}

// การ์ด "Job Type Bundle Template" — Dev note: "ต้องออกแบบ modal/screen 'ยืนยันก่อน save' ใหม่ —
// แสดงรายการทั้งหมดในเซตที่กำลังจะถูกบันทึกเป็น preset ใหม่ ให้แก้ไข/ลบรายการได้ก่อนกด Save จริง"
// เฉพาะ Owner/Manager/Admin เท่านั้นที่เห็น modal นี้ (Technician ไม่มีทาง trigger ได้ — เลือกจาก
// preset ที่มีอยู่แล้วเสมอ ไม่มีปุ่ม "สร้างชุดใหม่")
export default function JobTypeBundleConfirmModal({ initialJobTypeName, onCancel, onSave, saving }) {
  const [jobTypeName, setJobTypeName] = useState(initialJobTypeName || "");
  const [items, setItems] = useState([emptyItem()]);

  function updateItem(index, patch) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function addVariant(itemIndex) {
    setItems((prev) =>
      prev.map((it, i) => (i === itemIndex ? { ...it, variants: [...it.variants, emptyVariant()] } : it))
    );
  }
  function updateVariant(itemIndex, variantIndex, patch) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIndex
          ? { ...it, variants: it.variants.map((v, vi) => (vi === variantIndex ? { ...v, ...patch } : v)) }
          : it
      )
    );
  }
  function removeVariant(itemIndex, variantIndex) {
    setItems((prev) =>
      prev.map((it, i) => (i === itemIndex ? { ...it, variants: it.variants.filter((_, vi) => vi !== variantIndex) } : it))
    );
  }

  const canSave = jobTypeName.trim() && items.length > 0 && items.every((it) => it.item_group_label.trim() && it.description.trim());

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 20,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>สร้างเซตใหม่ — ต้องการปรับอะไรก่อน save ไหม?</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          รายการทั้งหมดด้านล่างจะถูกบันทึกเป็นเซต (preset) สำหรับประเภทงานนี้ — แก้ไข/ลบก่อนกด save ได้
        </div>

        <label>
          ชื่อประเภทงาน
          <input
            type="text"
            value={jobTypeName}
            onChange={(e) => setJobTypeName(e.target.value)}
            placeholder="เช่น เปลี่ยนถ่ายน้ำมันเครื่อง"
          />
        </label>

        <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>รายการในเซต</div>
        {items.map((item, itemIndex) => (
          <div
            key={itemIndex}
            style={{
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: 10,
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select
                value={item.category}
                onChange={(e) => updateItem(itemIndex, { category: e.target.value, is_price_locked: e.target.value !== "labor" })}
                style={{ width: 90 }}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="ชื่อรายการ เช่น น้ำมันเกียร์"
                value={item.item_group_label}
                onChange={(e) => updateItem(itemIndex, { item_group_label: e.target.value })}
                style={{ flex: 1, minWidth: 120 }}
              />
              <button type="button" onClick={() => removeItem(itemIndex)} style={{ border: "none", background: "transparent", color: "var(--danger-text)", cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="รายละเอียด default"
                value={item.description}
                onChange={(e) => updateItem(itemIndex, { description: e.target.value })}
                style={{ flex: 1, minWidth: 140 }}
              />
              <input
                type="number"
                placeholder="ราคา"
                value={item.default_amount}
                onChange={(e) => updateItem(itemIndex, { default_amount: e.target.value })}
                style={{ width: 90 }}
              />
            </div>

            {item.variants.map((variant, variantIndex) => (
              <div key={variantIndex} style={{ display: "flex", gap: 6, marginTop: 6, marginLeft: 16, flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="ชื่อ sub-variant เช่น CVT"
                  value={variant.variant_label}
                  onChange={(e) => updateVariant(itemIndex, variantIndex, { variant_label: e.target.value })}
                  style={{ width: 100 }}
                />
                <input
                  type="text"
                  placeholder="รายละเอียด"
                  value={variant.description}
                  onChange={(e) => updateVariant(itemIndex, variantIndex, { description: e.target.value })}
                  style={{ flex: 1, minWidth: 100 }}
                />
                <input
                  type="number"
                  placeholder="ราคา"
                  value={variant.default_amount}
                  onChange={(e) => updateVariant(itemIndex, variantIndex, { default_amount: e.target.value })}
                  style={{ width: 80 }}
                />
                <button
                  type="button"
                  onClick={() => removeVariant(itemIndex, variantIndex)}
                  style={{ border: "none", background: "transparent", color: "var(--danger-text)", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addVariant(itemIndex)}
              style={{ marginTop: 6, marginLeft: 16, fontSize: 12, border: "none", background: "transparent", color: "#2563eb", cursor: "pointer" }}
            >
              + เพิ่ม sub-variant
            </button>
          </div>
        ))}

        <button type="button" onClick={addItem} style={{ marginTop: 10, fontSize: 13 }}>
          + เพิ่มรายการ
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={saving}>
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onSave(jobTypeName.trim(), items)}
            disabled={!canSave || saving}
            style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}
          >
            {saving ? "กำลังบันทึก..." : "บันทึกเซตนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
