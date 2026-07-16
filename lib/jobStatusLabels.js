export const JOB_STATUSES = [
  "received",
  "in_progress",
  "waiting_parts",
  "completed",
  "delivered",
  "canceled",
];

export const JOB_STATUS_STYLE = {
  received: { label: "รับเรื่องแล้ว", color: "#93c5fd" },
  in_progress: { label: "กำลังซ่อม", color: "#fbbf24" },
  waiting_parts: { label: "รออะไหล่", color: "#f97316" },
  completed: { label: "ซ่อมเสร็จแล้ว", color: "#86efac" },
  delivered: { label: "ส่งมอบแล้ว", color: "#4ade80" },
  canceled: { label: "ยกเลิก", color: "#6b7280" },
};

export const JOB_SOURCE_TYPES = ["รถชน", "น้ำท่วม", "ประกัน total loss", "ซ่อมทั่วไป"];
