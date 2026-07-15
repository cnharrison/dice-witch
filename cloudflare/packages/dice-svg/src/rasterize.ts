import { Resvg, type ResvgRenderOptions } from "@cf-wasm/resvg/workerd";

export async function renderSvgToPng(
  svg: string,
  options?: ResvgRenderOptions,
): Promise<Uint8Array> {
  if (!svg.trim()) {
    throw new Error("SVG document is required");
  }

  const renderer = await Resvg.async(svg, options);
  try {
    const image = renderer.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
