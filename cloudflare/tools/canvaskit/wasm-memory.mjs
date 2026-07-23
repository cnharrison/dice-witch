const WASM_HEADER_LENGTH = 8;
const MEMORY_SECTION_ID = 5;

function readVarUint32(bytes, offset) {
  let value = 0;
  let shift = 0;
  let cursor = offset;

  while (shift < 35) {
    const byte = bytes[cursor];
    if (byte === undefined) {
      throw new Error("WebAssembly varuint32 is truncated");
    }
    cursor += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: value >>> 0, start: offset, end: cursor };
    }
    shift += 7;
  }

  throw new Error("WebAssembly varuint32 exceeds 32 bits");
}

function encodeVarUint32(value, length) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("WebAssembly memory page count must be a uint32");
  }

  const encoded = new Uint8Array(length);
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (index < length - 1) byte |= 0x80;
    encoded[index] = byte;
  }
  if (remaining !== 0) {
    throw new Error("WebAssembly memory page count does not fit the existing field");
  }
  return encoded;
}

function memorySection(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < WASM_HEADER_LENGTH) {
    throw new Error("CanvasKit WebAssembly input is invalid");
  }
  if (!WebAssembly.validate(bytes)) {
    throw new Error("CanvasKit WebAssembly input does not validate");
  }

  let offset = WASM_HEADER_LENGTH;
  while (offset < bytes.length) {
    const id = bytes[offset];
    if (id === undefined) break;
    offset += 1;
    const size = readVarUint32(bytes, offset);
    offset = size.end;
    const end = offset + size.value;
    if (end > bytes.length) {
      throw new Error("CanvasKit WebAssembly section is truncated");
    }
    if (id === MEMORY_SECTION_ID) {
      return { start: offset, end };
    }
    offset = end;
  }

  throw new Error("CanvasKit WebAssembly memory section is missing");
}

function locateMemoryLimits(bytes) {
  const section = memorySection(bytes);
  const count = readVarUint32(bytes, section.start);
  if (count.value !== 1) {
    throw new Error(`CanvasKit must declare exactly one memory; received ${String(count.value)}`);
  }

  const flags = readVarUint32(bytes, count.end);
  if ((flags.value & 1) === 0) {
    throw new Error("CanvasKit WebAssembly memory must declare a maximum");
  }

  const minimum = readVarUint32(bytes, flags.end);
  const maximum = readVarUint32(bytes, minimum.end);
  if (maximum.end > section.end) {
    throw new Error("CanvasKit WebAssembly memory declaration is truncated");
  }
  return { flags: flags.value, minimum, maximum };
}

export function readWasmMemoryLimits(bytes) {
  const { flags, minimum, maximum } = locateMemoryLimits(bytes);
  return {
    flags,
    initialPages: minimum.value,
    maximumPages: maximum.value,
  };
}

export function patchWasmMemoryLimits(
  input,
  { expectedInitialPages, expectedMaximumPages, initialPages, maximumPages },
) {
  if (initialPages > maximumPages) {
    throw new Error("CanvasKit initial memory cannot exceed maximum memory");
  }

  const output = new Uint8Array(input);
  const limits = locateMemoryLimits(output);
  if (
    limits.minimum.value !== expectedInitialPages ||
    limits.maximum.value !== expectedMaximumPages
  ) {
    throw new Error(
      `CanvasKit memory declaration changed: expected ${String(expectedInitialPages)}..${String(expectedMaximumPages)} pages, received ${String(limits.minimum.value)}..${String(limits.maximum.value)}`,
    );
  }

  output.set(
    encodeVarUint32(initialPages, limits.minimum.end - limits.minimum.start),
    limits.minimum.start,
  );
  output.set(
    encodeVarUint32(maximumPages, limits.maximum.end - limits.maximum.start),
    limits.maximum.start,
  );

  if (!WebAssembly.validate(output)) {
    throw new Error("Prepared CanvasKit WebAssembly output does not validate");
  }
  return output;
}
