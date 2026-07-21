"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { getAncestorChain, getChildren, getDescendantIds, isLeaf } from "../../../lib/zoneHelpers";

function ZonePageContent() {
  const { id: zoneId } = useParams();
  const router = useRouter();
  const { currentShopId } = useAuth();

  const [zones, setZones] = useState([]);
  const [partCount, setPartCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (currentShopId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, zoneId]);

  async function load() {
    setLoading(true);
    const { data: zoneRows } = await supabase
      .from("zones")
      .select("*")
      .eq("shop_id", currentShopId)
      .order("code", { ascending: true });

    const allZones = zoneRows || [];
    setZones(allZones);

    if (!allZones.some((z) => z.id === zoneId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const descendantIds = getDescendantIds(allZones, zoneId);
    const { count } = await supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", currentShopId)
      .eq("is_active", true)
      .in("zone_id", descendantIds);

    setPartCount(count ?? 0);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container">
        <div className="header">
          <h1>📍 ไม่พบโซนนี้</h1>
        </div>
        <div className="empty">โซนนี้อาจถูกลบไปแล้ว หรือ QR code เก่าเกินไป</div>
        <Link href="/admin/zones" className="nav-link secondary">
          ← ไปหน้าจัดการโซน
        </Link>
      </div>
    );
  }

  const chain = getAncestorChain(zones, zoneId);
  const zone = chain[chain.length - 1];
  const children = getChildren(zones, zoneId);

  return (
    <div className="container">
      <div className="header">
        <h1>📍 {zone.code}</h1>
        <Link href="/admin/zones" className="nav-link secondary">
          จัดการโซน
        </Link>
      </div>

      <div style={{ fontSize: 15, marginBottom: 4 }}>
        {chain.map((z, i) => (
          <span key={z.id}>
            {i > 0 && <span style={{ color: "var(--text-muted)" }}> › </span>}
            {z.code}
          </span>
        ))}
      </div>
      {zone.name && <div style={{ color: "var(--text-muted)", marginBottom: 16 }}>{zone.name}</div>}

      <div className="card" style={{ cursor: "default", marginBottom: 16 }}>
        <div className="card-body">
          <div className="card-title">📦 อะไหล่ในโซนนี้ (รวมโซนย่อยข้างใน)</div>
          <div className="card-sub">{partCount} ชิ้น</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {isLeaf(zones, zoneId) ? (
          <button type="button" onClick={() => router.push(`/add?zone_id=${zoneId}`)}>
            ➕ เพิ่มอะไหล่ที่นี่
          </button>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            โซนนี้มีโซนย่อยอยู่ข้างใน — เลือกโซนย่อยที่ต้องการด้านล่างก่อนถึงจะเพิ่มอะไหล่ได้
          </div>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => router.push(`/?zone=${zoneId}`)}
        >
          🔍 ดูอะไหล่ทั้งหมดในนี้
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => router.push(`/move-parts?from=${zoneId}`)}
        >
          📦 ย้ายอะไหล่ทั้งหมดจากที่นี่ไปโซนอื่น
        </button>
      </div>

      {children.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            โซนย่อยข้างใน ({children.length})
          </div>
          {children.map((c) => (
            <div
              className="card"
              key={c.id}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/zone/${c.id}`)}
            >
              <div className="card-body">
                <div className="card-title">{c.code}</div>
                {c.name && <div className="card-sub">{c.name}</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function ZonePage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <ZonePageContent />
    </RequireAuth>
  );
}
