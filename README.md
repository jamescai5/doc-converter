# Morph — Image & PDF Converter

A modern, single-page web app to convert images and PDFs into any other format,
right in your browser. **No login, no server, no upload** — every conversion runs
locally on your device, so your files never leave your computer.

![single page app](public/favicon.svg)

## Features

- 📥 Drag & drop (or browse) **up to 10 files** at once
- 🔎 **Automatic file-type detection** via magic-byte sniffing (not just the extension)
- 🎛️ Per-file **dropdown** to choose the target format
- ⚡ **Convert all** in one click, with a live spinner per row
- ⤓ Per-row **Download** button (enabled only once a file is converted) plus a
  **Download all** button that bundles results into a `.zip`
- 🔒 100% client-side — nothing is ever transmitted to a server

### Supported conversions

| From | To |
| --- | --- |
| PNG / JPG / WebP / GIF / BMP / other images | PNG · JPG · WebP · PDF |
| PDF | PNG · JPG · WebP (multi-page PDFs export as a `.zip` of pages) |

## Metrics

A password-protected dashboard lives at **`/metrics`**. It shows aggregate
totals (uploads, downloads, conversions) across all visitors plus a 30-day trend
chart. Events are recorded by a tiny Express backend and persisted to a JSON file
(`DATA_DIR/metrics.json`) — no database required.

Configure via environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `METRICS_PASSWORD` | `admin` | Password to view `/metrics`. **Set this in production.** |
| `DATA_DIR` | `./data` | Directory where `metrics.json` is stored. |
| `PORT` | `3001` (dev) | Port the server listens on (Railway sets this automatically). |

> The frontend fires fire-and-forget events to `POST /api/track`; the dashboard
> reads them from the protected `GET /api/metrics`.

## Tech stack

- **React + TypeScript** (via **Vite**)
- **Express** backend serving the SPA + metrics API
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) — rasterize PDF pages
- [`jspdf`](https://github.com/parallax/jsPDF) — wrap images into PDFs
- [`jszip`](https://github.com/Stuk/jszip) — bundle multi-file downloads
- Canvas API for image re-encoding

## Local development

```bash
npm install
npm run dev        # start Vite (http://localhost:5173) + API (http://localhost:3001)
npm run build      # type-check + production build into dist/
npm run start      # run the production server (serves dist/ + API on $PORT)
```

Set a metrics password locally:

```bash
METRICS_PASSWORD=your-password npm run dev
```

## Deploying to Railway

This repo is ready to deploy on [Railway](https://railway.app):

1. Create a new project → **Deploy from GitHub repo** → pick `jamescai5/doc-converter`.
2. Railway auto-detects the config in `railway.json` / `nixpacks.toml`:
   it runs `npm run build` and then starts the Express server (`npm run start`)
   on the `$PORT` Railway provides.
3. Under **Variables**, set:
   - `METRICS_PASSWORD` — your metrics dashboard password.
   - `DATA_DIR` — e.g. `/data`, and attach a **Volume** mounted at that path so
     your metric counts survive redeploys (Railway → service → **Volumes**).
4. Once deployed, open the generated domain (or add a custom one under
   **Settings → Networking**). Metrics live at `https://your-domain/metrics`.

Or from the CLI:

```bash
npm i -g @railway/cli
railway login
railway init          # link/create a project
railway up            # build & deploy
```

## Project layout

```
index.html            app entry
src/
  main.tsx            React bootstrap + tiny path router (/ and /metrics)
  App.tsx             converter page: single-page UI + state
  Metrics.tsx         password-gated metrics dashboard + chart
  styles.css          modern glassmorphism theme
  lib/
    formats.ts        format registry + auto type detection
    convert.ts        all conversion logic (image↔image, image→pdf, pdf→image)
    analytics.ts      fire-and-forget event tracking
server/index.js       Express: serves the SPA + /api/track + /api/metrics
public/favicon.svg    logo
railway.json          Railway build/deploy config
nixpacks.toml         Nixpacks build steps
```
