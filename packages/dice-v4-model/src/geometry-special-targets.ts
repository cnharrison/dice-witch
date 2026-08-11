import { D10_STANDARD_GEOMETRY_V4, PERCENTILE_STANDARD_GEOMETRY_V4 } from "./geometry-d10";
import { D12_STANDARD_GEOMETRY_V4 } from "./geometry-d12";
import { D4_STANDARD_GEOMETRY_V4 } from "./geometry-d4";
import { D6_STANDARD_GEOMETRY_V4 } from "./geometry-d6";
import { D8_STANDARD_GEOMETRY_V4 } from "./geometry-d8";
import { FUDGE_STANDARD_GEOMETRY_V4 } from "./geometry-fudge";
import {
  createCrystalCutGeometryV4,
  createHollowCageGeometryV4,
} from "./geometry-special";

const SPECIAL_FORM_SOURCES_V4 = [
  D4_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  D8_STANDARD_GEOMETRY_V4,
  D10_STANDARD_GEOMETRY_V4,
  D12_STANDARD_GEOMETRY_V4,
  PERCENTILE_STANDARD_GEOMETRY_V4,
  FUDGE_STANDARD_GEOMETRY_V4,
] as const;

export const ALL_TARGET_SPECIAL_FORM_GEOMETRIES_V4 = Object.freeze(
  SPECIAL_FORM_SOURCES_V4.flatMap((source) => [
    createCrystalCutGeometryV4(source),
    createHollowCageGeometryV4(source),
  ]),
);
