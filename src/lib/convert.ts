// All conversion happens 100% client-side. Images are re-encoded through a
// <canvas>; PDFs are rasterized with pdf.js; images are wrapped into PDFs with
// jsPDF. Multi-page PDF -> image conversions are bundled into a .zip.

import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import JSZip from "jszip";
import { FORMATS, FormatId, SourceKind } from "./formats";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ConvertResult {
  blob: Blob;
  /** File extension of the produced blob (e.g. "png", or "zip" for multi-page). */
  ext: string;
}

const JPEG_QUALITY = 0.92;
/** Render PDF pages at 2x for crisp raster output. */
const PDF_RENDER_SCALE = 2;

export async function convert(file: File, source: SourceKind, target: FormatId): Promise<ConvertResult> {
  if (source === "image") {
    return target === "pdf" ? imageToPdf(file) : imageToImage(file, target);
  }
  if (source === "pdf") {
    return pdfToImages(file, target);
  }
  throw new Error("Unsupported file type");
}

// ---------- helpers ----------

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      mime,
      quality,
    );
  });
}

/** Draw an image onto a fresh canvas, painting a white backdrop for opaque formats. */
function drawToCanvas(source: CanvasImageSource, width: number, height: number, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

// ---------- image -> image ----------

async function imageToImage(file: File, target: FormatId): Promise<ConvertResult> {
  const img = await loadImage(file);
  const format = FORMATS[target];
  const opaque = target === "jpeg";
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight, opaque);
  const blob = await canvasToBlob(canvas, format.mime, target === "png" ? undefined : JPEG_QUALITY);
  return { blob, ext: format.ext };
}

// ---------- image -> pdf ----------

async function imageToPdf(file: File): Promise<ConvertResult> {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // jsPDF embeds PNG/JPEG cleanly; normalize everything to PNG via canvas first.
  const canvas = drawToCanvas(img, w, h, false);
  const dataUrl = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: w >= h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  return { blob: pdf.output("blob"), ext: "pdf" };
}

// ---------- pdf -> image(s) ----------

async function pdfToImages(file: File, target: FormatId): Promise<ConvertResult> {
  const format = FORMATS[target];
  const opaque = target === "jpeg";
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages: Blob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    if (opaque) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(await canvasToBlob(canvas, format.mime, target === "png" ? undefined : JPEG_QUALITY));
  }

  if (pages.length === 1) {
    return { blob: pages[0], ext: format.ext };
  }

  // Multiple pages -> zip one image per page.
  const zip = new JSZip();
  const pad = String(pages.length).length;
  pages.forEach((blob, idx) => {
    zip.file(`page-${String(idx + 1).padStart(pad, "0")}.${format.ext}`, blob);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, ext: "zip" };
}

// ---------- download-all bundling ----------

export async function zipFiles(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const { name, blob } of entries) {
    // De-duplicate identical output names inside the archive.
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    const finalName = count === 0 ? name : addSuffix(name, ` (${count})`);
    zip.file(finalName, blob);
  }
  return zip.generateAsync({ type: "blob" });
}

function addSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name + suffix;
  return name.slice(0, dot) + suffix + name.slice(dot);
}
