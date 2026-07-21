// แม็ป TC ID -> Priority ตาม test_cases_login_rbac_parts_inventory.xlsx (sheet: Test Cases)
// และ JOB ID -> Priority ตาม test case "การสร้างงาน (Job Creation)" ที่ออกแบบไว้ในแชท
// ใช้สำหรับให้ agent report จัดลำดับความสำคัญของ failure ได้ถูกต้อง
export const PRIORITY_MAP = {
  "TC-001": "High", "TC-002": "High", "TC-003": "High", "TC-004": "High", "TC-005": "High",
  "TC-006": "Critical", "TC-007": "Critical",
  "TC-101": "High", "TC-102": "High", "TC-103": "High", "TC-104": "Medium", "TC-105": "Medium",
  "TC-106": "High", "TC-107": "High", "TC-108": "Medium", "TC-109": "Medium",
  "TC-110": "Critical", "TC-111": "Critical",
  "TC-201": "Critical", "TC-202": "Critical", "TC-203": "High", "TC-204": "Critical",
  "TC-205": "Critical", "TC-206": "Critical", "TC-207": "High",
  "TC-301": "Medium", "TC-302": "Medium", "TC-303": "High",
  "TC-401": "High", "TC-402": "High", "TC-403": "Medium", "TC-404": "High",
  "TC-501": "Low", "TC-502": "Medium", "TC-503": "Medium", "TC-504": "Low",

  "JOB-001": "High", "JOB-002": "High", "JOB-003": "High", "JOB-004": "Medium",
  "JOB-101": "High", "JOB-102": "Medium", "JOB-103": "Medium",
  "JOB-201": "High", "JOB-202": "Critical", "JOB-203": "Critical", "JOB-204": "Low", "JOB-205": "Medium",
  "JOB-301": "Medium", "JOB-303": "High",
  "JOB-401": "Medium", "JOB-402": "Medium",
  "JOB-501": "Medium", "JOB-502": "Medium", "JOB-503": "Low",
  "JOB-601": "High", "JOB-602": "High", "JOB-603": "High",
  "JOB-701": "Medium", "JOB-702": "Low",
  "JOB-801": "High", "JOB-802": "Critical",

  // คืนวันที่ 21 ก.ค. 2026 — ฟีเจอร์ใหม่คืนนั้น (13 การ์ด)
  "TOS-001": "Critical", "TOS-002": "Critical", "TOS-003": "Critical", "TOS-004": "High",
  "JOBSTAT-001": "High", "JOBSTAT-002": "High", "JOBSTAT-003": "High", "JOBSTAT-004": "Medium",
  "JOBSTAT-005": "High", "JOBSTAT-006": "High", "JOBSTAT-007": "Critical", "JOBSTAT-008": "Critical",
  "AUDIT-001": "High", "AUDIT-002": "High", "AUDIT-003": "Medium", "AUDIT-004": "High", "AUDIT-005": "Medium",
  "MOVEPARTS-001": "Medium", "MOVEPARTS-002": "High",
  "MOVEPART-001": "High", "MOVEPART-002": "High", "MOVEPART-003": "Medium", "MOVEPART-004": "Medium",
  "PAYMENT-001": "High", "PAYMENT-002": "High", "PAYMENT-003": "Critical",
  "SALVAGE-001": "High", "SALVAGE-002": "Medium", "SALVAGE-003": "Low", "SALVAGE-004": "Medium",
  "SALVAGE-005": "High", "SALVAGE-006": "High",
  "FIELDSCAN-001": "High", "FIELDSCAN-002": "Critical", "FIELDSCAN-003": "Critical",
  "FIELDSCAN-004": "Critical", "FIELDSCAN-005": "High", "FIELDSCAN-006": "Medium",
  "IMPORT-001": "High", "IMPORT-002": "Medium", "IMPORT-003": "High", "IMPORT-004": "Critical",
  "LABEL-001": "Medium", "LABEL-002": "Medium", "LABEL-003": "Low", "LABEL-004": "Low",
};

const ID_PATTERN = /(TC|JOB|TOS|JOBSTAT|AUDIT|MOVEPARTS|MOVEPART|PAYMENT|SALVAGE|FIELDSCAN|IMPORT|LABEL)-\d{3}/;

export function priorityOf(title) {
  const match = title.match(ID_PATTERN);
  return match ? PRIORITY_MAP[match[0]] || "Unmapped" : "Unmapped";
}

export function tcIdOf(title) {
  const match = title.match(ID_PATTERN);
  return match ? match[0] : null;
}

export const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low", "Unmapped"];
