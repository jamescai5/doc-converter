// Minimal typings for the pre-bundled WASM build of libheif-js (the .mjs bundle
// inlines the .wasm binary, so it's safe to import directly into a worker).
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(imageData: ImageData, cb: (result: ImageData | null) => void): void;
  }
  interface HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
  }
  interface LibHeif {
    HeifDecoder: { new (): HeifDecoder };
  }
  const factory: (options?: Record<string, unknown>) => Promise<LibHeif>;
  export default factory;
}
