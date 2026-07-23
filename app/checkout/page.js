"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import RequireAuth from "../../components/RequireAuth";

const PAYMENT_METHODS = [
  { value: "cash", label: "เงินสด" },
  { value: "bank_transfer", label: "โอนเงิน" },
  { value: "card", label: "บัตร" },
  { value: "other", label: "อื่นๆ" },
];

// Card: "Cart-based selling flow — สร้างตะกร้าก่อนขาย" (Priority: Highest, L)
//
// Flow: /  (โหมด "🛒 เลือกขาย") -> /checkout?ids=1,2,3 (หน้านี้) -> ยืนยันขายทั้งหมด (ตัดสต็อก
// จริงตรงนี้ + สร้าง sale_orders/part_sales สถานะ pending_pick) -> Picking List -> Confirm Pick
// (เดียวกับใบเสร็จออก) -> completed
//
// Scope รอบนี้ (ดู db/cart_based_selling_flow_migration.sql หัวไฟล์สำหรับรายละเอียดเต็ม):
// รองรับ walk-in (ส่งมอบหน้าร้านทันที) เป็นทางเดียวที่ทำ Confirm Pick จบในหน้าเดียว — ยังไม่ทำ
// pack/ship แบบเต็มรูป, ยังไม่ทำ tax_invoice (แค่ receipt), ยังไม่ผูก Branch Transfer อัตโนมัติ
function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentShopId } = useAuth();

  const ids = (searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState([]); // { id, part_name, quantity, sellQty, sellPrice }

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // ผลลัพธ์ต่อชิ้นหลังกดยืนยันขาย: { [partId]: { success: bool, error?: string } }
  const [results, setResults] = useState(null);
  const [order, setOrder] = useState(null); // { order_id }
  const [pickBusy, setPickBusy] = useState(false);
  const [pickMsg, setPickMsg] = useState(null);
  const [notFoundIds, setNotFoundIds] = useState([]); // part_id ที่กด "หาไม่เจอ" แล้ว
  const [pickedIds, setPickedIds] = useState([]); // part_id ที่ pick เสร็จแล้ว (completed)

  useEffect(() => {
    if (currentShopId && ids.length > 0) fetchParts();
    else if (ids.length === 0) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  async function fetchParts() {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase
      .from("parts")
      .select("id, part_name, quantity, price")
      .in("id", ids);

    if (error) {
      setLoadError("โหลดข้อมูลไม่สำเร็จ: " + error.message);
      setRows([]);
    } else {
      // เคส id ไม่มีจริง/เป็นของร้านอื่น (RLS กรองออกไปแล้ว) -> ไม่ต้อง error ทั้งหน้า
      // แค่ไม่โผล่ในตะกร้า (ตาม test scenario "id ไม่มีจริง -> render/แจ้ง error ถูกต้อง ไม่ crash")
      const found = data || [];
      setRows(
        found.map((p) => ({
          id: p.id,
          part_name: p.part_name,
          quantity: Number(p.quantity) || 0,
          sellQty: String(Number(p.quantity) || 0),
          sellPrice: p.price != null ? String(p.price) : "",
        }))
      );
      if (found.length < ids.length) {
        setLoadError(
          `พบ ${found.length}/${ids.length} ชิ้น — บางชิ้นอาจถูกลบไปแล้วหรือไม่ใช่ของร้านนี้`
        );
      }
    }
    setLoading(false);
  }

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function validateRows() {
    for (const r of rows) {
      const qty = Number(r.sellQty);
      if (!qty || qty <= 0) return `${r.part_name}: กรุณาระบุจำนวนที่ขาย`;
      if (qty > r.quantity) return `${r.part_name}: เหลือในสต็อกแค่ ${r.quantity} ชิ้น ขายเกินไม่ได้`;
      // ราคาขาย = 0 อนุญาต (ตัดสินใจแล้วในการ์ด) — บล็อกเฉพาะค่าว่าง/ติดลบ
      if (r.sellPrice === "" || Number(r.sellPrice) < 0) return `${r.part_name}: กรุณาระบุราคาขาย`;
    }
    return null;
  }

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.sellQty) || 0) * (Number(r.sellPrice) || 0), 0);

  async function handleConfirmSellAll() {
    setSubmitError("");

    if (rows.length === 0) {
      setSubmitError("ไม่มีชิ้นในตะกร้าแล้ว");
      return;
    }
    if (!paymentMethod) {
      setSubmitError("กรุณาเลือกวิธีชำระเงิน");
      return;
    }
    const rowError = validateRows();
    if (rowError) {
      setSubmitError(rowError);
      return;
    }

    // กันกดซ้ำเร็วๆ (double-submit) — ปิดปุ่มทันทีตั้งแต่บรรทัดแรก ก่อน await ใดๆ ทั้งสิ้น
    // (บทเรียนเดียวกับ JOB-701 ที่การ์ดอ้างถึง)
    if (submitting || results) return;
    setSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const soldTo = [buyerName, buyerPhone].filter(Boolean).join(" ") || null;

      const { data: orderRow, error: orderError } = await supabase
        .from("sale_orders")
        .insert({
          shop_id: currentShopId,
          buyer_name: buyerName || null,
          buyer_phone: buyerPhone || null,
          payment_method: paymentMethod,
          status: "pending_pick",
          created_by: userData?.user?.id || null,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      const perItemResults = {};
      // ทีละชิ้นเป็นอิสระต่อกัน (ตัดสินใจแล้วในการ์ด) — ชิ้นที่ fail ไม่ทำให้ชิ้นอื่นหยุด/rollback
      for (const r of rows) {
        const qty = Number(r.sellQty);
        const price = Number(r.sellPrice);
        try {
          const { data: newQuantity, error: deductError } = await supabase.rpc("deduct_part_stock", {
            p_part_id: r.id,
            p_quantity: qty,
          });
          if (deductError) throw deductError;

          const { error: saleError } = await supabase.from("part_sales").insert({
            part_id: r.id,
            shop_id: currentShopId,
            quantity_sold: qty,
            sale_price: price,
            sold_to: soldTo,
            sold_by: userData?.user?.id || null,
            payment_method: paymentMethod,
            order_id: orderRow.order_id,
            item_status: "pending_pick",
          });
          if (saleError) throw saleError;

          if (newQuantity <= 0) {
            await supabase.from("parts").update({ status: "sold", is_active: false }).eq("id", r.id);
          }

          perItemResults[r.id] = { success: true };
        } catch (err) {
          perItemResults[r.id] = { success: false, error: err.message || "ขายไม่สำเร็จ" };
        }
      }

      setOrder({ order_id: orderRow.order_id });
      setResults(perItemResults);
    } catch (err) {
      setSubmitError("สร้างออเดอร์ไม่สำเร็จ: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const successCount = results ? Object.values(results).filter((r) => r.success).length : 0;
  const failCount = results ? rows.length - successCount : 0;

  async function handleMarkNotFound(partId, qty) {
    setPickBusy(true);
    setPickMsg(null);
    try {
      const { error: restoreError } = await supabase.rpc("restore_part_stock", {
        p_part_id: partId,
        p_quantity: qty,
      });
      if (restoreError) throw restoreError;

      const { error: updateError } = await supabase
        .from("part_sales")
        .update({ item_status: "not_found", not_found_note: "หาไม่เจอตอน pick" })
        .eq("order_id", order.order_id)
        .eq("part_id", partId);
      if (updateError) throw updateError;

      setNotFoundIds((prev) => [...prev, partId]);
    } catch (err) {
      setPickMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
    } finally {
      setPickBusy(false);
    }
  }

  async function handleConfirmPickWalkIn() {
    setPickBusy(true);
    setPickMsg(null);
    try {
      const pendingRows = rows.filter(
        (r) => results[r.id]?.success && !notFoundIds.includes(r.id) && !pickedIds.includes(r.id)
      );

      const { error: updateError } = await supabase
        .from("part_sales")
        .update({ item_status: "completed" })
        .eq("order_id", order.order_id)
        .eq("item_status", "pending_pick");
      if (updateError) throw updateError;

      const docNumberRes = await supabase.rpc("generate_doc_number");
      if (docNumberRes.error) throw docNumberRes.error;

      const snapshot = {
        order_id: order.order_id,
        buyer_name: buyerName || null,
        buyer_phone: buyerPhone || null,
        payment_method: paymentMethod,
        items: pendingRows.map((r) => ({
          part_id: r.id,
          part_name: r.part_name,
          quantity: Number(r.sellQty),
          unit_price: Number(r.sellPrice),
          line_total: Number(r.sellQty) * Number(r.sellPrice),
        })),
        total_amount: pendingRows.reduce((sum, r) => sum + Number(r.sellQty) * Number(r.sellPrice), 0),
      };

      const { error: docError } = await supabase.from("part_sale_documents").insert({
        shop_id: currentShopId,
        order_id: order.order_id,
        doc_type: "receipt",
        doc_number: docNumberRes.data,
        snapshot,
      });
      if (docError) throw docError;

      const { error: orderUpdateError } = await supabase
        .from("sale_orders")
        .update({ status: "completed", picked_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("order_id", order.order_id);
      if (orderUpdateError) throw orderUpdateError;

      setPickedIds((prev) => [...prev, ...pendingRows.map((r) => r.id)]);
      setPickMsg({ type: "success", text: `ส่งมอบลูกค้าสำเร็จ ✅ เลขที่ใบเสร็จ ${docNumberRes.data}` });
    } catch (err) {
      setPickMsg({ type: "error", text: "ยืนยัน Pick ไม่สำเร็จ: " + err.message });
    } finally {
      setPickBusy(false);
    }
  }

  if (ids.length === 0) {
    return (
      <div className="container">
        <div className="msg error">ไม่มีรายการที่เลือก — กลับไปเลือกอะไหล่ที่หน้ารายการก่อน</div>
        <Link href="/">← กลับหน้ารายการ</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>🛒 ยืนยันการขาย</h2>
      <Link href="/" style={{ display: "inline-block", marginBottom: 12 }}>
        ← กลับหน้ารายการ
      </Link>

      {loading && <div className="empty">กำลังโหลด...</div>}
      {loadError && <div className="msg error">{loadError}</div>}

      {!loading && !results && (
        <>
          {rows.length === 0 ? (
            <div className="empty">ไม่มีชิ้นในตะกร้าแล้ว</div>
          ) : (
            rows.map((r) => (
              <div className="card" key={r.id} style={{ marginBottom: 8 }}>
                <div className="card-body" style={{ width: "100%" }}>
                  <div className="card-title">{r.part_name}</div>
                  <div className="card-sub">คงเหลือในสต็อก: {r.quantity} ชิ้น</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                    <label>
                      จำนวนขาย
                      <input
                        type="number"
                        value={r.sellQty}
                        onChange={(e) => updateRow(r.id, { sellQty: e.target.value })}
                        style={{ width: 90 }}
                      />
                    </label>
                    <label>
                      ราคาขาย/หน่วย
                      <input
                        type="number"
                        value={r.sellPrice}
                        onChange={(e) => updateRow(r.id, { sellPrice: e.target.value })}
                        style={{ width: 110 }}
                      />
                    </label>
                    <button type="button" onClick={() => removeRow(r.id)} style={{ alignSelf: "flex-end" }}>
                      ✕ ลบออกจากตะกร้า
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-body" style={{ width: "100%" }}>
              <label>
                ชื่อผู้ซื้อ
                <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </label>
              <label>
                เบอร์โทรผู้ซื้อ
                <input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
              </label>
              <label>
                วิธีชำระเงิน
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">— เลือก —</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ fontWeight: 700, marginTop: 8 }}>ยอดรวม: {totalAmount.toLocaleString()} บาท</div>
            </div>
          </div>

          {submitError && <div className="msg error">{submitError}</div>}

          <button
            type="button"
            onClick={handleConfirmSellAll}
            disabled={submitting || rows.length === 0}
            style={{ marginTop: 12, width: "100%", padding: 14, fontWeight: 700 }}
          >
            {submitting ? "กำลังบันทึก..." : "✓ ยืนยันการขายทั้งหมด"}
          </button>
        </>
      )}

      {results && (
        <>
          <div className={`msg ${failCount === 0 ? "success" : "error"}`}>
            ขายสำเร็จ {successCount}/{rows.length} ชิ้น
            {failCount > 0 && " — มีบางชิ้นขายไม่สำเร็จ (ดูรายละเอียดด้านล่าง)"}
          </div>

          <h3>📋 Picking List</h3>
          {rows.map((r) => {
            const res = results[r.id];
            const isPicked = pickedIds.includes(r.id);
            const isNotFound = notFoundIds.includes(r.id);
            return (
              <div
                className="card"
                key={r.id}
                style={{ marginBottom: 8, opacity: res?.success ? 1 : 0.6 }}
              >
                <div className="card-body" style={{ width: "100%" }}>
                  <div className="card-title">
                    {r.part_name} {isPicked && "✅ pick แล้ว"} {isNotFound && "❌ หาไม่เจอ"}
                  </div>
                  <div className="card-sub">
                    จำนวน {r.sellQty} — ราคา {r.sellPrice} บาท/หน่วย
                  </div>
                  {res?.success ? (
                    !isPicked &&
                    !isNotFound && (
                      <button
                        type="button"
                        disabled={pickBusy}
                        onClick={() => handleMarkNotFound(r.id, Number(r.sellQty))}
                        style={{ marginTop: 6 }}
                      >
                        หาไม่เจอ / ของเสียหาย (คืนสต็อก)
                      </button>
                    )
                  ) : (
                    <div className="msg error" style={{ marginTop: 6 }}>
                      ขายไม่สำเร็จ: {res?.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {pickMsg && <div className={`msg ${pickMsg.type}`}>{pickMsg.text}</div>}

          {successCount > pickedIds.length && (
            <button
              type="button"
              onClick={handleConfirmPickWalkIn}
              disabled={pickBusy}
              style={{ marginTop: 12, width: "100%", padding: 14, fontWeight: 700 }}
            >
              {pickBusy ? "กำลังบันทึก..." : "✓ Confirm Pick เสร็จ — ส่งมอบลูกค้าหน้าร้านทันที (ออกใบเสร็จ)"}
            </button>
          )}

          <div style={{ marginTop: 12 }}>
            <Link href="/">← กลับหน้ารายการ</Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant", "admin"]}>
      <Suspense fallback={<div className="container">กำลังโหลด...</div>}>
        <CheckoutPageContent />
      </Suspense>
    </RequireAuth>
  );
}
