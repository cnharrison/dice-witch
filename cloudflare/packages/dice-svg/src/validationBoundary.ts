import { z } from "zod";
import {
  APPEARANCE_FONT_IDS,
  PATTERN_NAMES_V1_V2,
  PATTERN_NAMES_V3,
  type IconName,
} from "./types";

export type ValidationInput = z.input<z.ZodUnknown>;
export type BoundaryRecord = z.output<
  z.ZodRecord<z.ZodString, z.ZodUnknown>
>;

const nonRecordValueSchema = z.union([
  z.null(),
  z.undefined(),
  z.string(),
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
  z.boolean(),
  z.bigint(),
  z.symbol(),
  z.function(),
]);
const objectValueSchema = z.custom<object>(
  (value) =>
    !nonRecordValueSchema.safeParse(value).success && !Array.isArray(value),
);
export const boundaryRecordSchema = z.custom<BoundaryRecord>(
  (value) => objectValueSchema.safeParse(value).success,
);
export const appearanceFontSchema = z.enum(APPEARANCE_FONT_IDS);
export const iconNameSchema = z.enum([
  "trashcan",
  "explosion",
  "recycle",
  "chevronUp",
  "chevronDown",
  "target-success",
  "critical-success",
  "critical-failure",
  "penetrate",
  "unique",
  "blank",
] satisfies readonly IconName[]);
export const patternNameV1V2Schema = z.enum(PATTERN_NAMES_V1_V2);
export const patternNameV3Schema = z.enum(PATTERN_NAMES_V3);
export const percentileResultSchema = z.union([
  z.literal(0),
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(40),
  z.literal(50),
  z.literal(60),
  z.literal(70),
  z.literal(80),
  z.literal(90),
]);
export const fudgeResultSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(1),
]);
export const booleanValueSchema = z.boolean();
export const numberValueSchema = z.union([
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
]);
export const stringValueSchema = z.string();

export function isBoundaryRecord(
  value: ValidationInput,
): value is BoundaryRecord {
  return boundaryRecordSchema.safeParse(value).success;
}

export function hasExactKeys(
  value: BoundaryRecord,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}
