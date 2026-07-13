"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import CarAutocomplete from "../../../components/CarAutocomplete";

const CONDITIONS = ["ใหม่", "มือสอง-ดี", "มือสอง-ซ่อม"];
const SOURCE_TYPES = ["รถชน", "ประกัน total loss", "น้ำท่วม"];
const STATUSES = ["available", "reserved", "sold"];

export default function EditPartPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [yearHint, setYearHint] = useState(null);

  useEffect(() => {
    fetchPart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchPart() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("parts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      setMsg({ type: "error", text: "โหลดข้อมูลไม่สำเร็จ: " + error.message });
    } else {
      setForm(data);
      setPreview(data.photo_url);
    }
    setLoading(false);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      let photo_url = form.photo_url;

      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("part-photos")
          .upload(fileName, photoFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("part-photos")
          .getPublicUrl(fileName);

        photo_url = publicUrlData.publicUrl;
      }

      const { error: updateError } = await supabase
        .from("parts")
        .update({
          part_name: form.part_name,
          car_brand: form.car_brand || null,
          car_model: form.car_model || null,
          car_year: form.car_year ? Number(form.car_year) : null,
          condition: form.condition,
          zone_code: form.zone_code || null,
          source_type: form.source_type,
          status: form.status,
          price: form.price ? Number(form.price) : null,
          photo_url,
        })
        .eq("id", id);

      if (updateError) throw updateError;

      setMsg({ type: "success", text: "บันทึกการแก้ไขเรียบร้อยแล้ว ✅" });
      setTimeout(() => {
        router.push("/");
      }, 800);
    } catch (err) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `ลบ "${form.part_name}" ออกจากสต็อกใช่ไหม? การลบนี้กู้คืนไม่ได้`
    );
    if (!confirmed) return;

    setDeleting(true);
    setMsg(null);

    try {
      const { error } = await supabase.from("parts").delete().eq("id", id);
      if (error) throw error;

      router.push("/");
    } catch (err) {
      setMsg({ type: "error", text: "ลบไม่สำเร็จ: " + err.message });
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="container">
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <Link href="/" className="nav-link secondary" style={{ marginTop: 16, display: "inline-block" }}>
          ← กลับหน้าแรก
        </Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>✏️ แก้ไขอะไหล่</h1>
        <Link href="/" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
        <label>
          รูปภาพ (เลือกใหม่ถ้าต้องการเปลี่ยน)
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
        </label>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 8 }}
          />
        )}

        <label>
          ชื่อชิ้นส่วน *
          <input
            type="text"
            name="part_name"
            value={form.part_name || ""}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          🔍 ค้นหารถ (ยี่ห้อ/รุ่น) — เปลี่ยนถ้าต้องการ
          <CarAutocomplete
            onSelect={(item) => {
              setForm((f) => ({
                ...f,
                car_brand: item.brand,
                car_model: item.model,
                car_year: item.year_start !== "" ? item.year_start : f.car_year,
              }));
              setYearHint({ start: item.year_start, end: item.year_end });
            }}
          />
        </label>

        <label>
          ยี่ห้อรถ
          <input
            type="text"
            name="car_brand"
            value={form.car_brand || ""}
            onChange={handleChange}
          />
        </label>

        <label>
          รุ่นรถ
          <input
            type="text"
            name="car_model"
            value={form.car_model || ""}
            onChange={handleChange}
          />
        </label>

        <label>
          ปีรถ
          <input
            type="number"
            name="car_year"
            value={form.car_year || ""}
            onChange={handleChange}
            placeholder="เช่น 2015"
          />
          {yearHint && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              รุ่นนี้ผลิตช่วง {yearHint.start}–{yearHint.end}
            </span>
          )}
        </label>

        <label>
          สภาพ
          <select name="condition" value={form.condition || CONDITIONS[0]} onChange={handleChange}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          ที่มา
          <select name="source_type" value={form.source_type || SOURCE_TYPES[0]} onChange={handleChange}>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          สถานะ
          <select name="status" value={form.status || "available"} onChange={handleChange}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          โซนจัดเก็บ
          <input
            type="text"
            name="zone_code"
            value={form.zone_code || ""}
            onChange={handleChange}
          />
        </label>

        <label>
          ราคา (บาท)
          <input
            type="number"
            name="price"
            value={form.price || ""}
            onChange={handleChange}
          />
        </label>

        <button type="submit" disabled={saving || deleting}>
          {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleDelete}
        disabled={saving || deleting}
        style={{
          marginTop: 12,
          width: "100%",
          padding: 14,
          borderRadius: 8,
          border: "1px solid #7f1d1d",
          background: "transparent",
          color: "#fca5a5",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {deleting ? "กำลังลบ..." : "🗑️ ลบอะไหล่นี้"}
      </button>
    </div>
  );
}
