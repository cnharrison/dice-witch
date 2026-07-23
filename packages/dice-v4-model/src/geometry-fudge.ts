import { D6_STANDARD_GEOMETRY_V4 } from "./geometry-d6";
import type {
  GeometryFaceV4,
  GeometryResultOrientationV4,
  PolyhedralGeometryDescriptorV4,
} from "./geometry";

const FUDGE_FACE_VALUES_V4 = [1, -1, 0, 0, -1, 1] as const;
const FUDGE_FACE_IDS_V4 = [
  "face-positive-a",
  "face-negative-a",
  "face-blank-a",
  "face-blank-b",
  "face-negative-b",
  "face-positive-b",
] as const;

const FUDGE_FACES_V4: readonly GeometryFaceV4[] =
  D6_STANDARD_GEOMETRY_V4.faces.map((source, index) => {
    const value = FUDGE_FACE_VALUES_V4[index];
    const id = FUDGE_FACE_IDS_V4[index];
    const label = source.labels[0];
    if (value === undefined || id === undefined || label === undefined) {
      throw new Error("Fudge face definition is missing");
    }
    return {
      ...source,
      id,
      labels: [{ ...label, value }],
    };
  });

const FUDGE_RESULT_SOURCE_D6_RESULT_V4 = new Map<-1 | 0 | 1, number>([
  [-1, 2],
  [0, 3],
  [1, 1],
]);

function resultOrientation(result: -1 | 0 | 1): GeometryResultOrientationV4 {
  const sourceResult = FUDGE_RESULT_SOURCE_D6_RESULT_V4.get(result);
  const source = D6_STANDARD_GEOMETRY_V4.resultOrientations.find(
    (orientation) => orientation.result === sourceResult,
  );
  if (source === undefined) throw new Error("Fudge result pose is missing");
  return { result, rotation: source.rotation };
}

export const FUDGE_STANDARD_GEOMETRY_V4 = Object.freeze({
  version: 1,
  id: "fudge-standard-r1",
  kind: "polyhedral",
  target: "fudge",
  form: "standard",
  vertices: D6_STANDARD_GEOMETRY_V4.vertices,
  faces: FUDGE_FACES_V4,
  skinMapping: { kind: "face-coordinates" },
  resultOrientations: [
    resultOrientation(-1),
    resultOrientation(0),
    resultOrientation(1),
  ],
  camera: D6_STANDARD_GEOMETRY_V4.camera,
} satisfies PolyhedralGeometryDescriptorV4);
