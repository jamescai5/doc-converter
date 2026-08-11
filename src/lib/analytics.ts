// Fire-and-forget analytics. Sends aggregate event counts to the backend so the
// /metrics page can report total uploads/downloads/conversions. Never blocks the
// UI and silently ignores failures (e.g. when running the static build with no
// server attached).

export type EventType = "upload" | "download" | "conversion";

export function track(type: EventType, count = 1): void {
  const payload = JSON.stringify({ type, count });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track", blob);
      return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}
