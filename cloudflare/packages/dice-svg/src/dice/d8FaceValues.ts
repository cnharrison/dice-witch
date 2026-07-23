export type D8FaceValues = {
  result: number;
  left: number;
  right: number;
  bottom: number;
};

const D8_FACE_VALUES: readonly D8FaceValues[] = [
  { result: 1, bottom: 6, left: 4, right: 8 },
  { result: 2, bottom: 5, left: 7, right: 3 },
  { result: 3, bottom: 8, left: 2, right: 6 },
  { result: 4, bottom: 7, left: 5, right: 1 },
  { result: 5, bottom: 2, left: 8, right: 4 },
  { result: 6, bottom: 1, left: 3, right: 7 },
  { result: 7, bottom: 4, left: 6, right: 2 },
  { result: 8, bottom: 3, left: 1, right: 5 },
];

export function getD8FaceValues(result: number): D8FaceValues {
  if (!Number.isInteger(result) || result < 1 || result > 8) {
    throw new Error("D8 result must be from 1 through 8");
  }
  const values = D8_FACE_VALUES[result - 1];
  if (values === undefined) {
    throw new Error("D8 face-value configuration is incomplete");
  }
  return { ...values };
}
