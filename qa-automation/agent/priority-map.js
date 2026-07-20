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
};

const ID_PATTERN = /(TC|JOB)-\d{3}/;

export function priorityOf(title) {
  const match = title.match(ID_PATTERN);
  return match ? PRIORITY_MAP[match[0]] || "Unmapped" : "Unmapped";
}

export function tcIdOf(title) {
  const match = title.match(ID_PATTERN);
  return match ? match[0] : null;
}

export const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low", "Unmapped"];
