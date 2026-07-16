"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading, memberships, refreshMemberships } = useAuth();

  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  // ถ้ามี session อยู่แล้ว (เช่น เพิ่งกดยืนยันอีเมลกลับมา) แต่มีอู่แล้วจริงๆ
  // (ไม่ใช่แค่รอ RPC สร้างอู่) ให้เด้งกลับหน้าแรกแทน ไม่ต้องมาที่นี่อีก
  useEffect(() => {
    if (!loading && session && memberships.length > 0) {
      router.replace("/");
    }
  }, [loading, session, memberships, router]);

  const isReturningAfterEmailConfirm = !loading && !!session && memberships.length === 0;

  // เคส 1: ยังไม่ login เลย -> สมัครใหม่แบบเต็ม (อีเมล+รหัสผ่าน+ชื่ออู่)
  async function handleFullSignup(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) throw signUpError;

      if (!signUpData.session) {
        setMsg({
          type: "success",
          text: "สมัครสำเร็จ! กรุณาเช็คอีเมลเพื่อยืนยันบัญชี แล้วกดลิงก์ในอีเมลเพื่อกลับมาสร้างอู่ต่อ",
        });
        setSubmitting(false);
        return;
      }

      // มี session ทันที (ปิด email confirm อยู่)
      // เช็คก่อนว่ามีคำเชิญค้างรออยู่ตามอีเมลนี้ไหม -> ถ้ามี เข้าอู่ที่ถูกเชิญแทน
      // ไม่สร้างอู่ใหม่ซ้อน (กันบั๊กที่คนถูกเชิญดันไปเป็นเจ้าของอู่ใหม่ของตัวเอง)
      const { data: existingMemberships } = await supabase.rpc("accept_pending_invites");

      if (!existingMemberships || existingMemberships.length === 0) {
        const { error: rpcError } = await supabase.rpc("create_shop_with_owner", {
          p_shop_name: shopName,
        });
        if (rpcError) throw rpcError;
      }

      await refreshMemberships();
      router.replace("/");
    } catch (err) {
      setMsg({ type: "error", text: "สมัครไม่สำเร็จ: " + err.message });
      setSubmitting(false);
    }
  }

  // เคส 2: login อยู่แล้ว (เพิ่งกดลิงก์ยืนยันอีเมลกลับมา) แต่ยังไม่มีอู่ -> สร้างอู่อย่างเดียว
  async function handleCompleteShop(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);

    try {
      const { error: rpcError } = await supabase.rpc("create_shop_with_owner", {
        p_shop_name: shopName,
      });
      if (rpcError) throw rpcError;

      await refreshMemberships();
      router.replace("/");
    } catch (err) {
      setMsg({ type: "error", text: "สร้างอู่ไม่สำเร็จ: " + err.message });
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 400, paddingTop: 60 }}>
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // เคส 2: ยืนยันอีเมลกลับมาแล้ว ล็อกอินอยู่ แต่ยังไม่มีอู่ -> ให้กรอกแค่ชื่ออู่
  // ------------------------------------------------------------
  if (isReturningAfterEmailConfirm) {
    return (
      <div className="container" style={{ maxWidth: 400, paddingTop: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚗</div>
          <h1 style={{ fontSize: 20 }}>ยืนยันอีเมลสำเร็จ! ตั้งชื่ออู่ต่อได้เลย</h1>
        </div>

        {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

        <form onSubmit={handleCompleteShop}>
          <label>
            ชื่ออู่/ร้าน
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="เช่น อู่พี่ต้อม ออโต้พาร์ท"
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังสร้าง..." : "สร้างอู่ + เริ่มทดลองใช้"}
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------
  // เคส 1: ยังไม่ login -> ฟอร์มสมัครเต็มรูปแบบตามเดิม
  // ------------------------------------------------------------
  return (
    <div className="container" style={{ maxWidth: 400, paddingTop: 40 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚗</div>
        <h1 style={{ fontSize: 20 }}>สร้างอู่ใหม่</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>ทดลองใช้ฟรี 14 วัน ไม่ต้องผูกบัตร</p>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleFullSignup}>
        <label>
          ชื่ออู่/ร้าน
          <input
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="เช่น อู่พี่ต้อม ออโต้พาร์ท"
            required
          />
        </label>
        <label>
          อีเมล
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "กำลังสร้าง..." : "สร้างอู่ + เริ่มทดลองใช้"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" style={{ color: "var(--link)" }}>
          เข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
