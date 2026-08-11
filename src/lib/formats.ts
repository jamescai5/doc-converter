// Central definition of every format the app understands, plus the logic for
// auto-detecting an uploaded file's type and deciding what it can convert into.

export type FormatId = "png" | "jpeg" | "webp" | "pdf";

export interface FormatInfo {
  id: FormatId;
  label: string;
  mime: string;
  ext: string;
}

export const FORMATS: Record<FormatId, FormatInfo> = {
  png: { id: "png", label: "PNG", mime: "image/png", ext: "png" },
  jpeg: { id: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg" },
  webp: { id: "webp", label: "WebP", mime: "image/webp", ext: "webp" },
  pdf: { id: "pdf", label: "PDF", mime: "application/pdf", ext: "pdf" },
};

export type SourceKind = "image" | "pdf" | "unknown";

export interface DetectedType {
  kind: SourceKind;
  /** Human-friendly label of the detected source format, e.g. "PNG" or "PDF". */
  label: string;
}

/**
 * Sniff the first bytes of a file to determine its true type, independent of the
 * (often wrong or missing) filename extension and browser-reported MIME type.
 */
export async function detectType(file: File): Promise<DetectedType> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const magic = detectByMagic(header);
  if (magic) return magic;

  // Fall back to the browser-reported MIME type, then the extension.
  if (file.type === "application/pdf") return { kind: "pdf", label: "PDF" };
  if (file.type.startsWith("image/")) {
    return { kind: "image", label: file.type.replace("image/", "").toUpperCase() };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { kind: "pdf", label: "PDF" };
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(ext)) {
    return { kind: "image", label: ext.toUpperCase() };
  }

  return { kind: "unknown", label: "Unknown" };
}

function detectByMagic(b: Uint8Array): DetectedType | null {
  const startsWith = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);

  // %PDF
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return { kind: "pdf", label: "PDF" };
  // PNG
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return { kind: "image", label: "PNG" };
  // JPEG
  if (startsWith(0xff, 0xd8, 0xff)) return { kind: "image", label: "JPG" };
  // GIF
  if (startsWith(0x47, 0x49, 0x46)) return { kind: "image", label: "GIF" };
  // BMP
  if (startsWith(0x42, 0x4d)) return { kind: "image", label: "BMP" };
  // RIFF....WEBP
  if (startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { kind: "image", label: "WebP" };
  }
  // AVIF / HEIC share the ISO-BMFF "ftyp" box at offset 4.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return { kind: "image", label: "Image" };
  }
  return null;
}

/** Which target formats make sense for a given detected source kind. */
export function targetsFor(kind: SourceKind): FormatId[] {
  switch (kind) {
    case "image":
      return ["png", "jpeg", "webp", "pdf"];
    case "pdf":
      return ["png", "jpeg", "webp"];
    default:
      return [];
  }
}
