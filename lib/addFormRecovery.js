// กู้คืนฟอร์ม + รูปของหน้า /add — แก้บั๊ก: Android Chrome ฆ่า background tab process
// ระหว่างเปิดแอปกล้อง native (input capture="environment") ทำให้กลับมาแล้ว Chrome ต้อง
// reload หน้าใหม่ทั้งหมด → React state (form + photos) หายหมด
//
// วิธีแก้ (ตัดสินใจแล้ว 19 ก.ค. 2026 — การ์ด "ถ่ายรูปตอนเพิ่มอะไหล่ (/add) บน Android Chrome"):
// แปลงรูปเป็น base64 เก็บคู่กับค่าฟอร์มใน sessionStorage ทุกครั้งที่เพิ่ม/ลบรูป (หรือแก้ฟอร์ม
// หลังมีรูปแล้ว) ตอน mount เช็คว่ามีข้อมูลค้างไหม ถ้ามีก็กู้คืน + แจ้งเตือนผู้ใช้

const STORAGE_KEY = "add_part_form_recovery_v1";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

// บันทึกฟอร์ม + รูปปัจจุบันลง sessionStorage
// ห่อด้วย try/catch เสมอ: ถ้าเขียนไม่ผ่าน (QuotaExceededError เมื่อรูปเยอะเกิน ~7 ใบ ที่ ~685KB/รูป
// รวม base64 overhead) ให้ข้ามการบันทึกรูปล่าสุดเงียบๆ — รูปยังอยู่ใน React state ใช้งานต่อได้ปกติ
// แค่กู้คืนไม่ครบถ้าเกิด reload จริงตอนนั้น
export async function saveRecoveryState(form, selectedGeneration, photoFiles) {
  if (typeof window === "undefined") return false;
  try {
    const photosBase64 = await Promise.all(
      (photoFiles || []).map(async (file) => ({
        dataUrl: await fileToBase64(file),
        name: file?.name || "photo.jpg",
      }))
    );
    const payload = {
      form,
      selectedGeneration: selectedGeneration || null,
      photosBase64,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    // QuotaExceededError หรือ error อื่นจาก sessionStorage — ข้ามเงียบๆ ตามที่ตัดสินใจไว้
    return false;
  }
}

export function loadRecoveryState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const photos = (payload.photosBase64 || []).map((p, i) => {
      const file = base64ToFile(p.dataUrl, p.name || `photo-${i}.jpg`);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
    return {
      form: payload.form || {},
      selectedGeneration: payload.selectedGeneration || null,
      photos,
      savedAt: payload.savedAt,
    };
  } catch (err) {
    return null;
  }
}

export function clearRecoveryState() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // ignore (private mode / storage disabled)
  }
}
