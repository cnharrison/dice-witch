import {
  LOADER_LOCATION_MARKER,
  LOADER_LOCATION_REPLACEMENT,
} from "./policy.mjs";

export function adaptCanvasKitLoader(source) {
  const markerCount = source.split(LOADER_LOCATION_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(
      `CanvasKit loader location marker count must be one; received ${String(markerCount)}`,
    );
  }
  const adapted = source.replace(
    LOADER_LOCATION_MARKER,
    LOADER_LOCATION_REPLACEMENT,
  );
  for (const prohibited of [
    'require("fs")',
    'require("path")',
    "ENVIRONMENT_IS_NODE",
  ]) {
    if (adapted.includes(prohibited)) {
      throw new Error(`CanvasKit loader contains prohibited marker ${prohibited}`);
    }
  }
  if (!adapted.includes("export default CanvasKitInit")) {
    throw new Error("CanvasKit loader is not an ES module");
  }
  if (!adapted.includes("instantiateWasm")) {
    throw new Error("CanvasKit loader does not accept imported WebAssembly");
  }
  return adapted;
}
