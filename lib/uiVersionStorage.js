const KEY = "ui_version";

export function getUiVersion() {
  if (typeof window === "undefined") return "v1";
  try {
    return window.localStorage.getItem(KEY) || "v1";
  } catch {
    return "v1";
  }
}

export function setUiVersion(version) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, version);
  } catch {
    // ignore
  }
}
