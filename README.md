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

## Tech stack

- **React + TypeScript** (via **Vite**)
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) — rasterize PDF pages
- [`jspdf`](https://github.com/parallax/jsPDF) — wrap images into PDFs
- [`jszip`](https://github.com/Stuk/jszip) — bundle multi-file downloads
- Canvas API for image re-encoding

## Local development

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check + production build into dist/
npm run preview    # preview the production build
```

## Deploying to Railway

This repo is ready to deploy on [Railway](https://railway.app):

1. Create a new project → **Deploy from GitHub repo** → pick `jamescai5/doc-converter`.
2. Railway auto-detects the config in `railway.json` / `nixpacks.toml`:
   it runs `npm run build` and then serves the static `dist/` folder with
   `serve` on the `$PORT` Railway provides.
3. Once deployed, open the generated domain (or add a custom one under
   **Settings → Networking**).

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
  main.tsx            React bootstrap
  App.tsx             single-page UI + state
  styles.css          modern glassmorphism theme
  lib/
    formats.ts        format registry + auto type detection
    convert.ts        all conversion logic (image↔image, image→pdf, pdf→image)
public/favicon.svg    logo
railway.json          Railway build/deploy config
nixpacks.toml         Nixpacks build steps
```
