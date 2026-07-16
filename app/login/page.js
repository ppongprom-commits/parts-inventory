"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (searchParams.get("reason") === "idle") {
      setMsg({ type: "error", text: "ระบบออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน" });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMsg({ type: "error", text: "เข้าสู่ระบบไม่สำเร็จ: " + error.message });
      setSubmitting(false);
    } else {
      router.replace("/");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 400, paddingTop: 60 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
        <h1 style={{ fontSize: 20 }}>เข้าสู่ระบบสต็อกอะไหล่</h1>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
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
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        ยังไม่มีบัญชี?{" "}
        <Link href="/signup" style={{ color: "var(--link)" }}>
          สร้างอู่ใหม่
        </Link>
      </div>

      <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
        เป็นหัวหน้างาน/ช่าง/ผู้ช่วยช่าง?{" "}
        <Link href="/staff-login" style={{ color: "var(--link)" }}>
          เข้าสู่ระบบด้วย username + PIN
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ maxWidth: 400, paddingTop: 60 }}>
          <div className="empty">กำลังโหลด...</div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
