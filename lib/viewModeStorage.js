const KEY = "parts_inventory_view_mode";

export function getViewMode() {
  if (typeof window === "undefined") return "list";
  try {
    return window.localStorage.getItem(KEY) || "list";
  } catch {
    return "list";
  }
}

export function setViewMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
}
