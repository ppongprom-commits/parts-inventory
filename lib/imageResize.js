/**
 * ลดขนาดรูปก่อนอัปโหลด — เก็บสัดส่วนเดิม จำกัดด้านยาวสุดไม่เกิน maxWidth/maxHeight
 * ใช้ createImageBitmap เพื่อให้ respect EXIF orientation อัตโนมัติ (รูปแนวตั้งจากมือถือไม่หมุนเพี้ยน)
 */
export async function resizeImageFile(
  file,
  { maxWidth = 2000, maxHeight = 2000, quality = 0.87 } = {}
) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    let { width, height } = bitmap;
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        quality
      );
    });

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (err) {
    // ถ้า resize ไม่สำเร็จ (browser เก่า/ไฟล์แปลก) ใช้ไฟล์ต้นฉบับแทน ดีกว่าบล็อกการอัปโหลด
    console.warn("resizeImageFile failed, using original file:", err);
    return file;
  }
}
