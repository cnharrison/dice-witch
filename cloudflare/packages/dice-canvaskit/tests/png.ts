const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const RGBA_CHANNELS = 4;

type DecodedPngRgba8 = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) << 24) |
    ((bytes[offset + 1] as number) << 16) |
    ((bytes[offset + 2] as number) << 8) |
    (bytes[offset + 3] as number)
  ) >>> 0;
}

function chunkName(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number,
  );
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function filterPrediction(
  filter: number,
  left: number,
  above: number,
  upperLeft: number,
): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return above;
    case 3:
      return Math.floor((left + above) / 2);
    case 4:
      return paeth(left, above, upperLeft);
    default:
      throw new Error("CanvasKit V4 test PNG filter is invalid");
  }
}

function unfilterScanlines(
  filtered: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * RGBA_CHANNELS;
  if (filtered.length !== height * (stride + 1)) {
    throw new Error("CanvasKit V4 test PNG scanline length is invalid");
  }
  const pixels = new Uint8Array(width * height * RGBA_CHANNELS);
  for (let y = 0; y < height; y += 1) {
    const inputOffset = y * (stride + 1);
    const outputOffset = y * stride;
    const filter = filtered[inputOffset] as number;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[inputOffset + x + 1] as number;
      const left = x >= RGBA_CHANNELS
        ? (pixels[outputOffset + x - RGBA_CHANNELS] as number)
        : 0;
      const above = y > 0 ? (pixels[outputOffset - stride + x] as number) : 0;
      const upperLeft = y > 0 && x >= RGBA_CHANNELS
        ? (pixels[outputOffset - stride + x - RGBA_CHANNELS] as number)
        : 0;
      const prediction = filterPrediction(filter, left, above, upperLeft);
      pixels[outputOffset + x] = (raw + prediction) & 0xff;
    }
  }
  return pixels;
}

export async function decodePngRgba8(
  png: Uint8Array<ArrayBuffer>,
): Promise<DecodedPngRgba8> {
  if (
    png.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((byte, index) => png[index] !== byte)
  ) {
    throw new Error("CanvasKit V4 test PNG signature is invalid");
  }

  let width = 0;
  let height = 0;
  let offset: number = PNG_SIGNATURE.length;
  const imageDataChunks: Uint8Array[] = [];
  while (offset + 12 <= png.length) {
    const length = uint32(png, offset);
    const name = chunkName(png, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > png.length) {
      throw new Error("CanvasKit V4 test PNG chunk is truncated");
    }
    if (name === "IHDR") {
      width = uint32(png, dataOffset);
      height = uint32(png, dataOffset + 4);
      if (
        length !== 13 ||
        png[dataOffset + 8] !== 8 ||
        png[dataOffset + 9] !== 6 ||
        png[dataOffset + 10] !== 0 ||
        png[dataOffset + 11] !== 0 ||
        png[dataOffset + 12] !== 0
      ) {
        throw new Error("CanvasKit V4 test PNG format is unsupported");
      }
    } else if (name === "IDAT") {
      imageDataChunks.push(png.slice(dataOffset, dataOffset + length));
    } else if (name === "IEND") {
      break;
    }
    offset = nextOffset;
  }
  if (width < 1 || height < 1 || imageDataChunks.length === 0) {
    throw new Error("CanvasKit V4 test PNG image data is missing");
  }

  const compressedLength = imageDataChunks.reduce(
    (total, chunk) => total + chunk.length,
    0,
  );
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const chunk of imageDataChunks) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.length;
  }
  const decompressed = new Uint8Array(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(
        new DecompressionStream("deflate"),
      ),
    ).arrayBuffer(),
  );
  return {
    width,
    height,
    pixels: unfilterScanlines(decompressed, width, height),
  };
}
