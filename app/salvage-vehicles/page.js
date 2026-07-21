"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import RequireAuth from "../../components/RequireAuth";

const STATUS_LABELS = {
  in_stock: { label: "ยังไม่ถอด", color: "#93c5fd" },
  disassembling: { label: "กำลังถอด", color: "#fbbf24" },
  fully_disassembled: { label: "ถอดหมดแล้ว", color: "#86efac" },
  sold_whole: { label: "ขายทั้งคัน", color: "#6b7280" },
};

function SalvageVehiclesPageContent() {
  const { currentShopId } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentShopId) return;
    supabase
      .from("salvage_vehicles")
      .select("*")
      .eq("shop_id", currentShopId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setVehicles(data || []);
        setLoading(false);
      });
  }, [currentShopId]);

  return (
    <div className="container">
      <div className="header">
        <h1>🚗 ซากรถ</h1>
        <Link href="/salvage-vehicles/new" className="nav-link">
          + รับซากรถใหม่
        </Link>
      </div>

      {loading && <div className="empty">กำลังโหลด...</div>}
      {!loading && vehicles.length === 0 && <div className="empty">ยังไม่มีซากรถในระบบ</div>}

      {vehicles.map((v) => (
        <Link href={`/salvage-vehicles/${v.vehicle_id}`} className="card" key={v.vehicle_id} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card-body">
            <div className="card-title">
              {v.chassis_number || v.license_plate || `ซากรถ #${v.vehicle_id}`}
            </div>
            <div className="card-sub">
              ซื้อ {v.purchase_price ? Number(v.purchase_price).toLocaleString() + " บาท" : "-"}
              {v.purchase_date ? ` — ${new Date(v.purchase_date).toLocaleDateString("th-TH")}` : ""}
            </div>
            <span className="tag" style={{ color: STATUS_LABELS[v.status]?.color }}>
              {STATUS_LABELS[v.status]?.label || v.status}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SalvageVehiclesPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <SalvageVehiclesPageContent />
    </RequireAuth>
  );
}
