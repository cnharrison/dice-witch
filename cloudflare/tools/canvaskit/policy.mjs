export const CANVASKIT_VERSION = "0.41.1";
export const RENDERER_REVISION = "canvaskit-v4-r1";
export const SKIA_REVISION = "3c68f3ffd7c9bc781494cdb85e718ff1e6f49d84";
export const SKIA_SOURCE_URL = `https://github.com/google/skia/commit/${SKIA_REVISION}`;
export const EMSDK_VERSION = "4.0.7";
export const EMSDK_IMAGE =
  "emscripten/emsdk:4.0.7@sha256:8acec700a48dbff5250afc1e3ee545b7c002b689043ee82c277de6481a237fd7";

export const BUILD_ARGUMENTS = Object.freeze([
  "cpu",
  "no_skottie",
  "no_skp_serialization",
  "no_effects_deserialization",
  "no_pathops",
  "no_canvas",
  "no_embedded_font",
  "no_woff2",
  "no_alias_font",
  "primitive_shaper",
  "no_encode_jpeg",
  "no_encode_webp",
]);

export const BUILD_HASHES = Object.freeze({
  sourcePatch:
    "37fc9863eb2330888588619deb23fdbe294f79e1c8e2b236d0fedc3085f01e4f",
  minimalDependencies:
    "f5945e2c4c133feb5fa91526c1afe3c11c8f2d98227ae0b63467289a61ce9003",
  rawLoader:
    "d43f2694a982548e1c62de8e0ad5e0c487ec9afdeb7b4b15bb6dd03f95794cc1",
  loader:
    "652f03772d663cd382c17f57f6d06e56320c6c16a2c777563fed56e1742ef8e1",
  wasm: "ac511ea702bd95f7c82ddff2cbe536c48e5b33ab2cddfb2f939dab4778eacfe9",
  types:
    "f0cf61f0f0e19086d6688a50fea95117711d68ea8e4080f10977fa826b18b0b2",
  license:
    "5f787c1dee3c56547f09ccc2906ab5f5293c4d8dd6c8654e573216c38e908dbd",
});

export const COMPATIBILITY_FIXTURE_HASHES = Object.freeze({
  probePngSha256:
    "ee1c899eea93a97676ea840f222c6e342af6668ba94ccfef068cbb40b72ac0fb",
  checkerboardD20PngSha256:
    "03a2050ce9450c60130c53c14db257fecafcc6a70a49edc07d4c0f7dd8652eac",
  stripedOtherPngSha256:
    "67a4adefa0a83d03a93ade5125d3ccef18f2ac7ae1cdaf693d14ebe2240cb150",
});

export const WASM_MEMORY_POLICY = Object.freeze({
  bytesPerPage: 65_536,
  initialPages: 512,
  maximumPages: 1_024,
  initialBytes: 32 * 1_024 * 1_024,
  maximumBytes: 64 * 1_024 * 1_024,
});

export const LOADER_LOCATION_MARKER =
  "ea=self.location.href;_scriptName&&(ea=_scriptName);";
export const LOADER_LOCATION_REPLACEMENT = 'ea="";';
