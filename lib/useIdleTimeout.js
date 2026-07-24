"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GLOBAL_SESSION_CONFIG } from "../config/subscriptionTiers";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

/**
 * ตรวจจับว่าผู้ใช้ไม่มีกิจกรรมเกิน idleTimeoutMinutes ไหม
 * ถ้าเกิน -> เปิด modal นับถอยหลัง idleWarningCountdownSeconds วินาที
 * ถ้าไม่กด "ยังอยู่" ก่อนหมดเวลา -> เรียก onTimeout() (ให้ผู้ใช้ปลั๊ก logout function เข้ามาเอง)
 *
 * ใช้งาน:
 *   const { showWarning, secondsLeft, stayLoggedIn } = useIdleTimeout({ onTimeout: handleLogout });
 */
export function useIdleTimeout({
  onTimeout,
  idleTimeoutMinutes = GLOBAL_SESSION_CONFIG.idleTimeoutMinutes,
  warningSeconds = GLOBAL_SESSION_CONFIG.idleWarningCountdownSeconds,
  enabled = true,
} = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(warningSeconds);

  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const showWarningRef = useRef(showWarning);
  showWarningRef.current = showWarning;

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    setSecondsLeft(warningSeconds);

    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          setShowWarning(false);
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningSeconds, onTimeout]);

  const resetIdleTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setSecondsLeft(warningSeconds);

    idleTimerRef.current = setTimeout(() => {
      startCountdown();
    }, idleTimeoutMinutes * 60 * 1000);
  }, [clearAllTimers, idleTimeoutMinutes, warningSeconds, startCountdown]);

  // ผู้ใช้กด "ยังอยู่" -> รีเซ็ตนาฬิกาทั้งหมด กลับไปเริ่มนับ idle ใหม่
  const stayLoggedIn = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!enabled) return;

    resetIdleTimer();

    const handleActivity = () => {
      // มีกิจกรรมระหว่างที่ยังไม่ขึ้น warning -> รีเซ็ตนับ idle เงียบๆ
      // (ถ้า warning เปิดอยู่แล้ว ต้องกดปุ่ม "ยังอยู่" เท่านั้น ไม่ reset จากการขยับเมาส์เฉยๆ
      //  เพื่อกันเคสสคริปต์/แมวเดินผ่านคีย์บอร์ดโดยไม่ตั้งใจ) ใช้ ref แทน state ตรงนี้ เพราะ effect
      //  นี้ต้อง mount แค่ครั้งเดียว (ดูหมายเหตุที่ deps array ด้านล่าง)
      if (!showWarningRef.current) {
        resetIdleTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
    // ⚠️ ห้ามใส่ showWarning ใน deps ตรงนี้ — เดิมใส่ไว้แล้วเป็นบั๊ก: พอ startCountdown() สั่ง
    // setShowWarning(true) ปุ๊บ effect นี้ re-run ทันที (เพราะ showWarning เปลี่ยน) ซึ่ง cleanup ของ
    // รอบก่อนหน้าไป clearAllTimers() เคลียร์ countdown ที่เพิ่งเริ่ม แล้ว resetIdleTimer() ในรอบใหม่ก็
    // setShowWarning(false) ทับทันที — modal เตือนเลยกระพริบขึ้นแล้วหายในติ๊กเดียว ไม่มีทางเห็นจริง
    // (ตรวจเจอจาก TC-301 — ดูรายละเอียดที่ qa-automation/tests/session.spec.js)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { showWarning, secondsLeft, stayLoggedIn };
}
