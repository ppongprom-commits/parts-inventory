"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import CarAutocomplete from "../../components/CarAutocomplete";
import { getDefaultZone, setDefaultZone } from "../../lib/zoneStorage";
import { resizeImageFile } from "../../lib/imageResize";
import { uploadPartPhotos } from "../../lib/storageHelpers";

export default function AddPartPage() {
  const router = useRouter();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [form, setForm] = useState({
    part_name: "",
    car_brand: "",
    car_model: "",
    condition: "",
    zone_code: "",
    source_type: "",
    quantity: "1",
    price: "",
    notes: "",
  });

  // ข้อมูลปี — มาจากฐานข้อมูลเท่านั้น ห้าม user พิมพ์เอง
  const [selectedGeneration, setSelectedGeneration] = useState(null); // { generation_id, year_range_display, ... }

  const [photos, setPhotos] = useState([]);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  const [conditions, setConditions] = useState([]);
  const [sourceTypes, setSourceTypes] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    const lastZone = getDefaultZone();
    if (lastZone) {
      setForm((f) => ({ ...f, zone_code: lastZone }));
    }
    fetchZones();
    fetchOptions();
  }, []);

  async function fetchZones() {
    setZonesLoading(true);
    const { data, error } = await supabase
      .from("zones")
      .select("*")
      .order("code", { ascending: true });
    if (!error) setZones(data || []);
    setZonesLoading(false);
  }

  async function fetchOptions() {
    setOptionsLoading(true);
    const { data, error } = await supabase
      .from("options")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error && data) {
      const cond = data.filter((o) => o.category === "condition").map((o) => o.value);
      const src = data.filter((o) => o.category === "source_type").map((o) => o.value);
      setConditions(cond);
      setSourceTypes(src);
      setForm((f) => ({
        ...f,
        condition: f.condition || cond[0] || "",
        source_type: f.source_type || src[0] || "",
      }));
    }
    setOptionsLoading(false);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    // ถ้าแก้ยี่ห้อ/รุ่นเองด้วยมือ (ไม่ผ่าน autocomplete) ให้ล้างข้อมูล generation ที่เคยเลือกไว้
    if (name === "car_brand" || name === "car_model") {
      setSelectedGeneration(null);
    }
  }

  function handleZoneChange(e) {
    const value = e.target.value;
    setForm((f) => ({ ...f, zone_code: value }));
    setDefaultZone(value);
  }

  async function handlePhotoChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setProcessingPhoto(true);
    setPhotoError("");

    const resizedList = [];
    for (const file of files) {
      const resized = await resizeImageFile(file);
      resizedList.push({ file: resized, previewUrl: URL.createObjectURL(resized) });
    }

    setPhotos((prev) => [...prev, ...resizedList]);
    setProcessingPhoto(false);
    e.target.value = "";
  }

  function handleRemovePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (photos.length === 0) {
      setPhotoError("ต้องมีรูปอย่างน้อย 1 รูปก่อนบันทึก");
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const photoUrls = await uploadPartPhotos(photos.map((p) => p.file));

      const { error: insertError } = await supabase.from("parts").insert({
        part_name: form.part_name,
        car_brand: form.car_brand || null,
        car_model: form.car_model || null,
        generation_id: selectedGeneration?.generation_id || null,
        car_year_display: selectedGeneration?.year_range_display || null,
        condition: form.condition || null,
        zone_code: form.zone_code || null,
        source_type: form.source_type || null,
        quantity: form.quantity ? Number(form.quantity) : 1,
        price: form.price ? Number(form.price) : null,
        notes: form.notes || null,
        photo_url: photoUrls[0] || null,
        photo_urls: photoUrls,
        status: "available",
        is_active: true,
      });

      if (insertError) throw insertError;

      const keepZone = form.zone_code;

      setMsg({ type: "success", text: "บันทึกอะไหล่เรียบร้อยแล้ว ✅" });
      setForm({
        part_name: "",
        car_brand: "",
        car_model: "",
        condition: conditions[0] || "",
        zone_code: keepZone,
        source_type: sourceTypes[0] || "",
        price: "",
      });
      setSelectedGeneration(null);
      setPhotos([]);
      setPhotoError("");

      setTimeout(() => {
        router.push("/");
      }, 800);
    } catch (err) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>+ เพิ่มอะไหล่ใหม่</h1>
        <Link href="/" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
        <label>
          รูปอะไหล่ * (อย่างน้อย 1 รูป เพิ่มได้หลายรูป)
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={processingPhoto}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 8,
                border: "1px dashed #333844",
                background: "#1a1d24",
                color: "#e8e8e8",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              📷 {processingPhoto ? "กำลังประมวลผล..." : "ถ่ายรูป"}
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={processingPhoto}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 8,
                border: "1px dashed #333844",
                background: "#1a1d24",
                color: "#e8e8e8",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              🖼️ {processingPhoto ? "กำลังประมวลผล..." : "เลือกจากคลังภาพ"}
            </button>
          </div>
        </label>

        {photos.length > 0 && (
          <div className="photo-thumb-row">
            {photos.map((p, i) => (
              <div className="photo-thumb" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt={`รูป ${i + 1}`}
                  onClick={() => setLightboxUrl(p.previewUrl)}
                />
                <button
                  type="button"
                  className="photo-remove-btn"
                  onClick={() => handleRemovePhoto(i)}
                  aria-label="ลบรูปนี้"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {photoError && <span style={{ fontSize: 12, color: "#fca5a5" }}>{photoError}</span>}

        {lightboxUrl && (
          <div
            onClick={() => setLightboxUrl(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              cursor: "zoom-out",
              padding: 20,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="ขยายรูป"
              style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }}
            />
          </div>
        )}

        <label>
          ชื่อชิ้นส่วน *
          <input
            type="text"
            name="part_name"
            value={form.part_name}
            onChange={handleChange}
            placeholder="เช่น ประตูขวา, กันชนหน้า"
            required
          />
        </label>

        <label>
          🔍 ค้นหารถ (ยี่ห้อ/รุ่น)
          <CarAutocomplete
            onSelect={(item) => {
              setForm((f) => ({
                ...f,
                car_brand: item.brand_name,
                car_model: item.model_name,
              }));
              setSelectedGeneration(item);
            }}
          />
        </label>

        <label>
          ยี่ห้อรถ
          <input
            type="text"
            name="car_brand"
            value={form.car_brand}
            onChange={handleChange}
            placeholder="เช่น Nissan"
          />
        </label>

        <label>
          รุ่นรถ
          <input
            type="text"
            name="car_model"
            value={form.car_model}
            onChange={handleChange}
            placeholder="เช่น March"
          />
        </label>

        <label>
          ปีที่ผลิต (ดึงจากฐานข้อมูลอัตโนมัติ — แก้เองไม่ได้)
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #333844",
              background: "#14161b",
              color: selectedGeneration ? "#e8e8e8" : "#6b7280",
              fontSize: 14,
            }}
          >
            {selectedGeneration
              ? `${selectedGeneration.year_range_display}${
                  selectedGeneration.generation_code
                    ? ` (${selectedGeneration.generation_code})`
                    : ""
                }`
              : "— เลือกรถจากช่องค้นหาด้านบนก่อน จะขึ้นปีให้อัตโนมัติ —"}
          </div>
        </label>

        <label>
          สภาพ
          <select name="condition" value={form.condition} onChange={handleChange}>
            {conditions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {!optionsLoading && conditions.length === 0 && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              ยังไม่มีตัวเลือก —{" "}
              <Link href="/admin/options" style={{ color: "#93c5fd" }}>
                เพิ่มที่หน้าตั้งค่า
              </Link>
            </span>
          )}
        </label>

        <label>
          ที่มา
          <select name="source_type" value={form.source_type} onChange={handleChange}>
            {sourceTypes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {!optionsLoading && sourceTypes.length === 0 && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              ยังไม่มีตัวเลือก —{" "}
              <Link href="/admin/options" style={{ color: "#93c5fd" }}>
                เพิ่มที่หน้าตั้งค่า
              </Link>
            </span>
          )}
        </label>

        <label>
          โซนจัดเก็บ
          <select name="zone_code" value={form.zone_code} onChange={handleZoneChange}>
            <option value="">ไม่ระบุโซน</option>
            {zones.map((z) => (
              <option key={z.id} value={z.code}>
                {z.code}
                {z.name ? ` — ${z.name}` : ""}
              </option>
            ))}
          </select>
          {!zonesLoading && zones.length === 0 && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              ยังไม่มีโซนในระบบ —{" "}
              <Link href="/admin/zones" style={{ color: "#93c5fd" }}>
                เพิ่มโซนก่อน
              </Link>
            </span>
          )}
        </label>

        <label>
          จำนวน
          <input
            type="number"
            name="quantity"
            value={form.quantity}
            onChange={handleChange}
            placeholder="1"
            min="0"
            step="any"
          />
        </label>

        <label>
          ราคา (บาท)
          <input
            type="number"
            name="price"
            value={form.price}
            onChange={handleChange}
            placeholder="ไม่บังคับ"
          />
        </label>

        <label>
          หมายเหตุ
          <input
            type="text"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="ไม่บังคับ"
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึกอะไหล่"}
        </button>
      </form>
    </div>
  );
}
