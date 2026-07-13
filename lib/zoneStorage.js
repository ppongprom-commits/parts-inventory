const KEY = "parts_inventory_default_zone_code";

export function getDefaultZone() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setDefaultZone(zoneCode) {
  if (typeof window === "undefined") return;
  try {
    if (zoneCode) {
      window.localStorage.setItem(KEY, zoneCode);
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    // ignore (private mode / storage disabled)
  }
}
