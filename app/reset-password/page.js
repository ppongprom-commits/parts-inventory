"use client";

// หน้ารับลิงก์รีเซ็ตรหัสผ่านจากอีเมล (Supabase resetPasswordForEmail)
// Supabase client จัดการ recovery session จาก URL fragment ให้อัตโนมัติ (detectSessionInUrl
// เปิดโดย default) — พอ session พร้อม หน้านี้แค่เรียก updateUser({ password }) ตั้งรหัสใหม่
//
// แทนที่การพึ่ง scripts/reset-owner-password.mjs รันมือถาวร (การ์ด "Reset password ให้คนในอู่")
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

function ResetPasswordContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasRecoverySession(!!data.session);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg({ type: "error", text: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
      return;
    }
    if (password !== confirmPassword) {
      setMsg({ type: "error", text: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setMsg({ type: "error", text: "ตั้งรหัสผ่านใหม่ไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว ✅ กำลังพาไปหน้าเข้าสู่ระบบ..." });
      setTimeout(() => router.replace("/login"), 1200);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 400, paddingTop: 60 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
        <h1 style={{ fontSize: 20 }}>ตั้งรหัสผ่านใหม่</h1>
      </div>

      {!ready && <div className="empty">กำลังตรวจสอบลิงก์...</div>}

      {ready && !hasRecoverySession && (
        <div className="msg error">
          ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว — กลับไปที่หน้าเข้าสู่ระบบแล้วขอลิงก์ใหม่อีกครั้ง
        </div>
      )}

      {ready && hasRecoverySession && (
        <form onSubmit={handleSubmit}>
          <label>
            รหัสผ่านใหม่
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </label>
          <label>
            ยืนยันรหัสผ่านใหม่
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </label>
          {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ maxWidth: 400, paddingTop: 60 }}>
          <div className="empty">กำลังโหลด...</div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
