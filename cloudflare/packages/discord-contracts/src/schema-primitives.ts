import { z } from "zod";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/u;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type SchemaInput = z.input<z.ZodUnknown>;

export const boundaryObjectSchema = z.looseObject({});
export type BoundaryObject = z.output<typeof boundaryObjectSchema>;

export const strictObjectSchema = z.strictObject;
export const exactEnumSchema = z.enum;

export const snowflakeSchema = z.string().regex(SNOWFLAKE);
export const interactionTokenSchema = z.string().regex(INTERACTION_TOKEN);
export const uuidV4Schema = z.string().regex(UUID_V4);
export const safeIntegerSchema = z.number().refine(Number.isSafeInteger);
export const nonNegativeSafeIntegerSchema = safeIntegerSchema.nonnegative();
export const positiveSafeIntegerSchema = safeIntegerSchema.positive();
export const timestampSchema = nonNegativeSafeIntegerSchema;
export const seedSchema = nonNegativeSafeIntegerSchema.max(0xffff_ffff);

export function boundedNameSchema(minimum: number, maximum: number) {
  return z.string().min(minimum).max(maximum);
}
