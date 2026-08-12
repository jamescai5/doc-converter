// Web Worker that decodes HEIC/HEIF off the main thread using the WASM build of
// libheif. libheif decodes to raw RGBA (ImageData), which we turn into a
// transferable ImageBitmap so the main thread never blocks and the UI stays
// responsive (progress bar keeps animating) during decoding.
import libheifFactory from "libheif-js/libheif-wasm/libheif-bundle.mjs";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

// Instantiate the WASM module once and reuse it across all decode requests.
const ready = libheifFactory();

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buffer } = e.data as { id: number; buffer: ArrayBuffer };
  try {
    const libheif = await ready;
    const images = new libheif.HeifDecoder().decode(new Uint8Array(buffer));
    if (!images || images.length === 0) throw new Error("No image found in this HEIC file");

    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    const imageData = new ImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (result) => (result ? resolve() : reject(new Error("HEIF processing error"))));
    });

    const bitmap = await createImageBitmap(imageData);
    ctx.postMessage({ id, bitmap }, [bitmap]);
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : "HEIC decoding failed" });
  }
};
