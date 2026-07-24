"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";

const STATUS_LABELS = {
  in_stock: "ยังไม่ถอด",
  disassembling: "กำลังถอด",
  fully_disassembled: "ถอดหมดแล้ว",
  sold_whole: "ขายทั้งคัน",
};

function SalvageVehicleDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const { currentShopId, currentRole } = useAuth();

  const [vehicle, setVehicle] = useState(null);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // การ์ด "Salvage vehicle cost allocation" — edge case 3 (ต้นทุนแรงงานถอด/ทำความสะอาด) — work
  // order เป็น sub-flow ของหน้านี้ ไม่ใช่ระบบแยก
  const [workOrders, setWorkOrders] = useState([]);
  const [members, setMembers] = useState([]);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [woForm, setWoForm] = useState({ scope: "", estimated_duration_hours: "", assigned_to: "", labor_rate: "" });
  const [savingWorkOrder, setSavingWorkOrder] = useState(false);
  const [closingWorkOrderId, setClosingWorkOrderId] = useState(null);

  useEffect(() => {
    if (currentShopId && id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, id]);

  async function load() {
    setLoading(true);
    const [{ data: v }, { data: p }, { data: wo }, { data: m }] = await Promise.all([
      supabase.from("salvage_vehicles").select("*").eq("vehicle_id", id).eq("shop_id", currentShopId).single(),
      supabase
        .from("parts")
        .select("id, part_name, price, status, estimated_value, allocated_cost")
        .eq("salvage_vehicle_id", id),
      supabase
        .from("salvage_vehicle_work_orders")
        .select("*")
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("shop_members")
        .select("user_id, role, contact_name, login_username")
        .eq("shop_id", currentShopId)
        .eq("status", "active")
        .in("role", ["owner", "manager", "supervisor", "technician"]),
    ]);
    setVehicle(v || null);
    setParts(p || []);
    setWorkOrders(wo || []);
    setMembers(m || []);
    setLoading(false);
  }

  function memberLabel(userId) {
    const m = members.find((mm) => mm.user_id === userId);
    if (!m) return userId?.slice(0, 8) || "-";
    return m.contact_name || m.login_username || userId.slice(0, 8);
  }

  function handleWoChange(e) {
    const { name, value } = e.target;
    setWoForm((f) => ({ ...f, [name]: value }));
  }

  // สร้างใบงานถอด/ทำความสะอาด — labor_cost เริ่มต้นเป็นค่าประมาณการ (estimated_duration_hours ×
  // labor_rate) ผ่าน RPC create_salvage_work_order (เช็คสิทธิ์ owner/manager/supervisor จาก
  // auth.uid() เองภายใน — ดู db/salvage_vehicle_labor_cost_and_work_order_migration.sql)
  async function handleCreateWorkOrder(e) {
    e.preventDefault();
    setMsg(null);
    setSavingWorkOrder(true);
    const { error } = await supabase.rpc("create_salvage_work_order", {
      p_vehicle_id: Number(id),
      p_scope: woForm.scope,
      p_estimated_duration_hours: Number(woForm.estimated_duration_hours),
      p_assigned_to: woForm.assigned_to || null,
      p_labor_rate: Number(woForm.labor_rate),
    });
    setSavingWorkOrder(false);
    if (error) {
      setMsg({ type: "error", text: "สร้างใบงานไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "สร้างใบงานถอด/ทำความสะอาดเรียบร้อยแล้ว ✅" });
      setWoForm({ scope: "", estimated_duration_hours: "", assigned_to: "", labor_rate: "" });
      setShowWorkOrderForm(false);
      load();
    }
  }

  // ปิดใบงาน — labor_cost เปลี่ยนจากค่าประมาณการ เป็นเวลาจริง (actual_end - actual_start) × labor_rate
  // ไม่กระทบ allocated_cost ของอะไหล่ที่คำนวณไปแล้วก่อนหน้าเลย (freeze เดิม — อะไหล่ใหม่ที่เพิ่มหลังจากนี้
  // เท่านั้นที่จะใช้ labor_cost ค่าล่าสุดนี้ไปคำนวณ)
  async function handleCloseWorkOrder(workOrderId) {
    if (!confirm("ยืนยันปิดใบงานนี้? ระบบจะคำนวณค่าแรงจริงจากเวลาที่ใช้จริง")) return;
    setMsg(null);
    setClosingWorkOrderId(workOrderId);
    const { error } = await supabase.rpc("close_salvage_work_order", { p_work_order_id: workOrderId });
    setClosingWorkOrderId(null);
    if (error) {
      setMsg({ type: "error", text: "ปิดใบงานไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "ปิดใบงานเรียบร้อยแล้ว — คำนวณค่าแรงจริงแล้ว ✅" });
      load();
    }
  }

  async function handleMarkFullyDisassembled() {
    setMsg(null);
    const { error } = await supabase
      .from("salvage_vehicles")
      .update({ status: "fully_disassembled" })
      .eq("vehicle_id", id)
      .eq("shop_id", currentShopId);
    if (error) {
      setMsg({ type: "error", text: "อัปเดตไม่สำเร็จ: " + error.message });
    } else {
      load();
    }
  }

  // การ์ด "Salvage vehicle cost allocation" — ขายซากที่เหลือเป็นเศษเหล็ก (สร้าง part สังเคราะห์รับ
  // allocated_cost ส่วนที่เหลือทั้งหมด แล้วปิดคันเป็น fully_disassembled อัตโนมัติ) ผ่าน RPC
  // sell_salvage_vehicle_scrap (เช็คสิทธิ์ owner/manager/supervisor จาก auth.uid() ภายในตัวมันเอง —
  // ดู db/salvage_vehicle_cost_allocation_migration.sql)
  async function handleSellScrap() {
    if (!confirm("ยืนยันขายซากที่เหลือเป็นเศษเหล็ก? การกระทำนี้จะปิดคันนี้ทันที (ทำอีกครั้งไม่ได้)")) {
      return;
    }
    setMsg(null);
    const { error } = await supabase.rpc("sell_salvage_vehicle_scrap", { p_vehicle_id: Number(id) });
    if (error) {
      setMsg({ type: "error", text: "ขายซากที่เหลือไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "ขายซากที่เหลือสำเร็จ — สร้างรายการอะไหล่เศษเหล็กแล้ว" });
      load();
    }
  }

  // เพิ่ม/ถอดอะไหล่จากคัน — ทุก role ที่เพิ่มอะไหล่ได้ปกติ (matrix การ์ด: "ทุก role ที่เพิ่มอะไหล่ได้
  // ปกติ รวม Technician/Assistant/Field Scanner") — หน้านี้จำกัดที่ RequireAuth ไว้แค่ 5 role อยู่แล้ว
  // (ไม่รวม field_scanner ตอนนี้ เพราะ field_scanner ยังไม่มีสิทธิ์เข้าหน้านี้โดยตรง — คนละการ์ด)
  const canExtract = ["owner", "manager", "supervisor", "technician"].includes(currentRole);
  // ปิดคัน/sold_whole/ขายเศษเหล็ก — Owner/Manager/Supervisor เท่านั้นตาม RBAC matrix ที่ตัดสินใจแล้ว
  // ในการ์ด (ต่างจาก canExtract เดิมที่รวม technician ด้วย — แก้ไข 22 ก.ค. 2026 ให้ตรงกับมติจริง)
  const canClose = ["owner", "manager", "supervisor"].includes(currentRole);
  // สร้าง/ปิดใบงานถอด/ทำความสะอาด — floor เดียวกับ purchase_price/estimated_value/ปิดคัน (Owner/
  // Manager/Supervisor เท่านั้น) บังคับจริงที่ RPC (create_salvage_work_order/close_salvage_work_order)
  // ค่านี้แค่ซ่อนปุ่มที่ UI ไว้ก่อนเหมือน canSetEstimatedValue ที่หน้า /add
  const canManageWorkOrders = canClose;

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="container">
        <div className="empty">ไม่พบซากรถนี้</div>
        <Link href="/salvage-vehicles" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🚗 {vehicle.chassis_number || vehicle.license_plate || `ซากรถ #${vehicle.vehicle_id}`}</h1>
        <Link href="/salvage-vehicles" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", marginBottom: 16 }}>
        <div className="card-body">
          <div>สถานะ: <strong data-testid="vehicle-status">{STATUS_LABELS[vehicle.status] || vehicle.status}</strong></div>
          <div>ราคาซื้อ: {vehicle.purchase_price ? Number(vehicle.purchase_price).toLocaleString() : "-"} บาท</div>
          <div>มูลค่าประเมินรวม: {vehicle.estimated_total_value ? Number(vehicle.estimated_total_value).toLocaleString() : "-"} บาท</div>
          <div data-testid="vehicle-labor-cost">
            ต้นทุนแรงงาน (จากใบงานถอด/ทำความสะอาด): {Number(vehicle.labor_cost || 0).toLocaleString()} บาท
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            ฐานคำนวณต้นทุนปันส่วน (allocation base) = ราคาซื้อ + ต้นทุนแรงงาน ={" "}
            {(Number(vehicle.purchase_price || 0) + Number(vehicle.labor_cost || 0)).toLocaleString()} บาท
          </div>
          {vehicle.value_groups?.length > 0 && (
            <ul style={{ fontSize: 13, marginTop: 6 }}>
              {vehicle.value_groups.map((g, i) => (
                <li key={i}>
                  {g.label}: {Number(g.estimated_value).toLocaleString()} บาท
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {vehicle.status !== "fully_disassembled" && vehicle.status !== "sold_whole" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {canExtract && (
            <button type="button" onClick={() => router.push(`/add?salvage_vehicle_id=${vehicle.vehicle_id}`)} data-testid="disassemble-button">
              ➡️ ถอดอะไหล่จากคันนี้
            </button>
          )}
          {canClose && parts.length > 0 && (
            <button type="button" className="secondary" onClick={handleMarkFullyDisassembled} data-testid="mark-fully-disassembled">
              ✅ ถอดหมดแล้ว/ปิดคัน
            </button>
          )}
          {canClose && (
            <button type="button" className="secondary" onClick={handleSellScrap} data-testid="sell-scrap-button">
              🗑️ ขายซากที่เหลือ (เศษเหล็ก)
            </button>
          )}
        </div>
      )}

      {/* การ์ด "Salvage vehicle cost allocation" — edge case 3: ใบงานถอด/ทำความสะอาด (work order)
          sub-flow ของหน้ารับ-รื้อซากนี้ — labor_cost ที่คำนวณได้ไหลเข้า salvage_vehicles.labor_cost
          อัตโนมัติ (trigger) แล้วรวมเข้าฐานคำนวณ allocated_cost ของอะไหล่ใหม่ที่จะเพิ่มถัดไป */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>🧰 ใบงานถอด/ทำความสะอาด ({workOrders.length})</div>
        {canManageWorkOrders && vehicle.status !== "fully_disassembled" && vehicle.status !== "sold_whole" && (
          <button
            type="button"
            className="secondary"
            onClick={() => setShowWorkOrderForm((s) => !s)}
            data-testid="toggle-work-order-form"
          >
            {showWorkOrderForm ? "ยกเลิก" : "+ สร้างใบงาน"}
          </button>
        )}
      </div>

      {showWorkOrderForm && (
        <form onSubmit={handleCreateWorkOrder} className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", padding: 12, marginBottom: 16, gap: 10 }}>
          <label>
            Scope งาน (รายการ/ชิ้นส่วนที่จะถอด) *
            <input
              type="text"
              name="scope"
              value={woForm.scope}
              onChange={handleWoChange}
              placeholder="เช่น ถอดเครื่อง+เกียร์+ระบบไฟ"
              required
              data-testid="wo-scope-input"
            />
          </label>
          <label>
            ระยะเวลาโดยประมาณ (ชั่วโมง) *
            <input
              type="number"
              name="estimated_duration_hours"
              value={woForm.estimated_duration_hours}
              onChange={handleWoChange}
              min="0.1"
              step="any"
              required
              data-testid="wo-estimated-duration-input"
            />
          </label>
          <label>
            ช่างที่รับผิดชอบ
            <select name="assigned_to" value={woForm.assigned_to} onChange={handleWoChange} data-testid="wo-assigned-to-select">
              <option value="">-- ไม่ระบุ --</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.contact_name || m.login_username}
                </option>
              ))}
            </select>
          </label>
          <label>
            อัตราค่าแรง (บาท/ชั่วโมง) *
            <input
              type="number"
              name="labor_rate"
              value={woForm.labor_rate}
              onChange={handleWoChange}
              min="0"
              step="any"
              required
              data-testid="wo-labor-rate-input"
            />
          </label>
          <button type="submit" disabled={savingWorkOrder} data-testid="wo-submit-button">
            {savingWorkOrder ? "กำลังบันทึก..." : "บันทึกใบงาน"}
          </button>
        </form>
      )}

      {workOrders.length === 0 && !showWorkOrderForm && (
        <div className="empty" style={{ marginBottom: 16 }}>ยังไม่มีใบงานถอด/ทำความสะอาด</div>
      )}
      {workOrders.map((wo) => (
        <div className="card" key={wo.work_order_id} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", marginBottom: 10 }} data-testid={`work-order-${wo.work_order_id}`}>
          <div className="card-body">
            <div className="card-title">{wo.scope}</div>
            <div className="card-sub">
              สถานะ: <strong>{wo.status === "open" ? "กำลังทำ" : "ปิดแล้ว"}</strong> · ช่าง: {memberLabel(wo.assigned_to)}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              ประมาณการ: {wo.estimated_duration_hours} ชม. × {Number(wo.labor_rate).toLocaleString()} บาท/ชม.
            </div>
            <div style={{ fontSize: 13 }} data-testid={`work-order-labor-cost-${wo.work_order_id}`}>
              ต้นทุนแรงงาน{wo.status === "open" ? " (ประมาณการ)" : " (จริง)"}: {Number(wo.labor_cost).toLocaleString()} บาท
            </div>
            {canManageWorkOrders && wo.status === "open" && (
              <button
                type="button"
                className="secondary"
                onClick={() => handleCloseWorkOrder(wo.work_order_id)}
                disabled={closingWorkOrderId === wo.work_order_id}
                data-testid={`close-work-order-${wo.work_order_id}`}
                style={{ marginTop: 8 }}
              >
                {closingWorkOrderId === wo.work_order_id ? "กำลังปิด..." : "✅ ปิดใบงาน"}
              </button>
            )}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>อะไหล่ที่ถอดแล้ว ({parts.length})</div>
      {parts.length === 0 && <div className="empty">ยังไม่มีอะไหล่ที่ถอดจากคันนี้</div>}
      {parts.map((p) => (
        <Link href={`/edit/${p.id}`} className="card" key={p.id} style={{ textDecoration: "none", color: "inherit" }} data-testid={`salvage-part-${p.id}`}>
          <div className="card-body">
            <div className="card-title">{p.part_name}</div>
            <div className="card-sub">{p.status}</div>
            {/* edge case 2 (การ์ด "Salvage vehicle cost allocation"): ของแถมที่ไม่ได้ประเมินไว้
                (estimated_value = null) ได้ allocated_cost = 0 เสมอ ต่างจาก parts อื่นที่ไม่ผูก
                salvage เลย (allocated_cost = null แสดง "-") */}
            <div className="card-sub" data-testid={`salvage-part-allocated-cost-${p.id}`}>
              ต้นทุนปันส่วน: {p.allocated_cost !== null ? Number(p.allocated_cost).toLocaleString() : "-"} บาท
              {p.estimated_value === null && " (ของแถม — ไม่มีมูลค่าประเมิน)"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SalvageVehicleDetailPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <SalvageVehicleDetailPageContent />
    </RequireAuth>
  );
}
