export function checkYearOutOfRange(carYear, yearHint) {
  if (!carYear || !yearHint || !yearHint.start) return false;

  const year = Number(carYear);
  const start = Number(yearHint.start);
  const endRaw = yearHint.end;
  const end =
    !endRaw || endRaw.includes("ปัจจุบัน") || endRaw.includes("ปัจจุบ")
      ? new Date().getFullYear() + 1 // เผื่อรุ่นปีหน้า/ปัจจุบัน
      : Number(endRaw);

  if (Number.isNaN(year) || Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  return year < start || year > end;
}
