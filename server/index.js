// Tiny backend for Morph: serves the built SPA and records aggregate
// upload/download/conversion counts from every visitor. Counters persist to a
// JSON file on disk (DATA_DIR) so they survive restarts when a volume is
// mounted. No database or native dependencies.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "metrics.json");

const PORT = process.env.PORT || 3001;
// Password required to view /api/metrics. CHANGE THIS in production via env.
const METRICS_PASSWORD = process.env.METRICS_PASSWORD || "admin";
const EVENT_TYPES = ["upload", "download", "conversion"];

// ---------- persistent store ----------

function blankStore() {
  const totals = {};
  for (const t of EVENT_TYPES) totals[t] = 0;
  return { totals, daily: {}, since: new Date().toISOString() };
}

let store = blankStore();

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    store = { ...blankStore(), ...parsed };
    store.totals = { ...blankStore().totals, ...(parsed.totals || {}) };
    store.daily = parsed.daily || {};
  } catch {
    store = blankStore();
  }
}

let flushTimer = null;
let dirty = false;

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 1500);
}

function flush() {
  flushTimer = null;
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, DATA_FILE); // atomic replace
  } catch (err) {
    console.error("[metrics] flush failed:", err);
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

// ---------- app ----------

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

// Public: record one or more events. Body: {type,count} or {events:[{type,count}]}
app.post("/api/track", (req, res) => {
  const body = req.body || {};
  const events = Array.isArray(body.events) ? body.events : [body];
  const day = todayKey();
  if (!store.daily[day]) {
    store.daily[day] = {};
    for (const t of EVENT_TYPES) store.daily[day][t] = 0;
  }
  for (const ev of events) {
    const type = ev && ev.type;
    if (!EVENT_TYPES.includes(type)) continue;
    let count = Number(ev.count);
    if (!Number.isFinite(count)) count = 1;
    count = Math.max(1, Math.min(1000, Math.floor(count))); // clamp abuse
    store.totals[type] += count;
    store.daily[day][type] += count;
  }
  scheduleFlush();
  res.status(204).end();
});

// Protected: return totals + a 30-day daily series.
app.get("/api/metrics", (req, res) => {
  const key = req.get("x-metrics-key") || req.query.key;
  if (key !== METRICS_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const days = 30;
  const series = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    const rec = store.daily[k] || {};
    series.push({
      date: k,
      upload: rec.upload || 0,
      download: rec.download || 0,
      conversion: rec.conversion || 0,
    });
  }
  res.json({ totals: store.totals, since: store.since, series });
});

// Serve the built SPA (production) with history fallback for client routes.
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      return res.sendFile(path.join(DIST, "index.html"));
    }
    next();
  });
}

load();
const server = app.listen(PORT, () => {
  console.log(`[morph] server listening on :${PORT}`);
  if (METRICS_PASSWORD === "admin") {
    console.warn('[morph] METRICS_PASSWORD is the default "admin" — set it via env in production.');
  }
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}
