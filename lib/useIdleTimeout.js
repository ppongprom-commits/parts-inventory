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
      //  เพื่อกันเคสสคริปต์/แมวเดินผ่านคีย์บอร์ดโดยไม่ตั้งใจ)
      if (!showWarning) {
        resetIdleTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, showWarning]);

  return { showWarning, secondsLeft, stayLoggedIn };
}
