"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { getViewMode, setViewMode } from "../lib/viewModeStorage";

const PAGE_SIZE = 50;

export default function HomePage() {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [viewMode, setViewModeState] = useState("list");

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [zones, setZones] = useState([]);
  const [brands, setBrands] = useState([]);

  const debounceRef = useRef(null);

  useEffect(() => {
    setViewModeState(getViewMode());
    fetchZones();
    fetchBrands();
    fetchParts(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ค้นหา/filter เปลี่ยน -> รีเซ็ตกลับหน้าแรกเสมอ (debounce ช่องค้นหาข้อความ กันยิง query รัวๆ ทุกตัวอักษร)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchParts(0, false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, brandFilter, zoneFilter]);

  function handleViewModeChange(mode) {
    setViewModeState(mode);
    setViewMode(mode);
  }

  async function fetchZones() {
    const { data, error } = await supabase
      .from("zones")
      .select("*")
      .order("code", { ascending: true });
    if (!error) setZones(data || []);
  }

  async function fetchBrands() {
    const { data, error } = await supabase
      .from("parts")
      .select("car_brand")
      .not("car_brand", "is", null)
      .eq("is_active", true);
    if (!error && data) {
      const unique = [...new Set(data.map((d) => d.car_brand).filter(Boolean))].sort();
      setBrands(unique);
    }
  }

  async function fetchParts(pageNum, append) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setErrorMsg("");

    let query = supabase
      .from("parts")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (search.trim()) {
      const s = search.trim();
      query = query.or(`part_name.ilike.%${s}%,car_model.ilike.%${s}%`);
    }
    if (brandFilter) {
      query = query.eq("car_brand", brandFilter);
    }
    if (zoneFilter) {
      query = query.eq("zone_code", zoneFilter);
    }

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error } = await query;

    if (error) {
      setErrorMsg("โหลดข้อมูลไม่สำเร็จ: " + error.message);
    } else {
      const newData = data || [];
      setParts((prev) => (append ? [...prev, ...newData] : newData));
      setHasMore(newData.length === PAGE_SIZE);
      setPage(pageNum);
    }

    setLoading(false);
    setLoadingMore(false);
  }

  function handleLoadMore() {
    fetchParts(page + 1, true);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📦 สต็อกอะไหล่</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin" className="nav-link secondary">
            ⚙️ ตั้งค่า
          </Link>
          <Link href="/add" className="nav-link">
            + เพิ่มอะไหล่
          </Link>
        </div>
      </div>

      <div className="filters" style={{ alignItems: "center" }}>
        <input
          type="text"
          placeholder="ค้นหาชื่ออะไหล่ / รุ่นรถ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">ทุกยี่ห้อ</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
          <option value="">ทุกโซน</option>
          {zones.map((z) => (
            <option key={z.id} value={z.code}>
              {z.code}
              {z.name ? ` — ${z.name}` : ""}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => handleViewModeChange("list")}
          >
            📃 List
          </button>
          <button
            type="button"
            className={viewMode === "gallery" ? "active" : ""}
            onClick={() => handleViewModeChange("gallery")}
          >
            🖼 Gallery
          </button>
        </div>
      </div>

      {errorMsg && <div className="msg error">{errorMsg}</div>}
      {loading && <div className="empty">กำลังโหลด...</div>}

      {!loading && parts.length === 0 && (
        <div className="empty">ยังไม่มีอะไหล่ในระบบ หรือไม่พบผลลัพธ์ที่ค้นหา</div>
      )}

      {viewMode === "list" &&
        parts.map((p) => (
          <Link
            href={`/edit/${p.id}`}
            className="card"
            key={p.id}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {p.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo_url} alt={p.part_name} loading="lazy" decoding="async" />
            ) : (
              <div className="no-photo">ไม่มีรูป</div>
            )}
            <div className="card-body">
              <div className="card-title">{p.part_name}</div>
              <div className="card-sub">
                {p.car_brand} {p.car_model} {p.car_year ? `(${p.car_year})` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.zone_code && <span className="tag zone">📍 {p.zone_code}</span>}
                {p.condition && <span className="tag">{p.condition}</span>}
                {p.source_type && <span className="tag">{p.source_type}</span>}
                {p.status && <span className="tag">{p.status}</span>}
                {p.photo_urls?.length > 1 && (
                  <span className="tag">📷 {p.photo_urls.length} รูป</span>
                )}
              </div>
              {p.price && (
                <div className="card-sub" style={{ marginTop: 2 }}>
                  ราคา: {Number(p.price).toLocaleString()} บาท
                </div>
              )}
            </div>
          </Link>
        ))}

      {viewMode === "gallery" && (
        <div className="gallery-grid">
          {parts.map((p) => (
            <Link href={`/edit/${p.id}`} className="gallery-item" key={p.id}>
              {p.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt={p.part_name} loading="lazy" decoding="async" />
              ) : (
                <div className="no-photo">ไม่มีรูป</div>
              )}
              <div className="gallery-caption">
                {p.part_name}
                {p.photo_urls?.length > 1 ? ` · 📷${p.photo_urls.length}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && hasMore && parts.length > 0 && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          style={{
            width: "100%",
            padding: 14,
            marginTop: 8,
            borderRadius: 8,
            border: "1px solid #333844",
            background: "#1a1d24",
            color: "#e8e8e8",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
        </button>
      )}
    </div>
  );
}
