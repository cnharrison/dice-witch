import { loadCanvasKitV4 } from "../src/runtime";

export default {
  async fetch(): Promise<Response> {
    const canvasKit = await loadCanvasKitV4();
    return Response.json({
      ok: true,
      wasmMemoryBytes: canvasKit.HEAPU8.buffer.byteLength,
    });
  },
};
