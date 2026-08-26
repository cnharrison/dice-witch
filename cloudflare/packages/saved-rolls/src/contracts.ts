import { z } from "zod";
import {
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
  parseNotationArgs,
  prepareRollAppearance,
} from "../../roll-domain/src";
import { parseSavedRollNameColorV2 } from "./color";
import { parseSavedRollNameV1 } from "./name";

export { parseSavedRollNameColorV2 } from "./color";

const MAX_TITLE_LENGTH = 256;

export type SavedRollDraftV1 = {
  version: 1;
  displayName: string;
  comparisonKey: string;
  notation: string;
  title: string | null;
  repetitions: number;
};

export type SavedRollDraftV2 = Omit<SavedRollDraftV1, "version"> & {
  version: 2;
  nameColor: string | null;
};

const SavedRollDraftV1Schema = z.strictObject({
  version: z.literal(1),
  name: z.unknown(),
  notation: z.unknown(),
  repetitions: z.unknown(),
  title: z.unknown(),
});
const SavedRollDraftV2Schema = z.strictObject({
  version: z.literal(2),
  name: z.unknown(),
  nameColor: z.unknown(),
  notation: z.unknown(),
  repetitions: z.unknown(),
  title: z.unknown(),
});
const SavedRollNotationSchema = z.string();
const SavedRollRepetitionsSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .min(1)
  .max(MAX_REPETITIONS);
const SavedRollTitleSchema = z.union([
  z.null(),
  z.string().min(1).max(MAX_TITLE_LENGTH),
]);
type SavedRollDraftV1Input = Parameters<typeof SavedRollDraftV1Schema.parse>[0];
type SavedRollDraftV2Input = Parameters<typeof SavedRollDraftV2Schema.parse>[0];
type SavedRollNotationInput = Parameters<typeof SavedRollNotationSchema.parse>[0];
type SavedRollRepetitionsInput = Parameters<
  typeof SavedRollRepetitionsSchema.parse
>[0];
type SavedRollTitleInput = Parameters<typeof SavedRollTitleSchema.parse>[0];

function parseNotation(
  value: SavedRollNotationInput,
  repetitions: number,
): string {
  const result = SavedRollNotationSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Saved roll notation must be a string");
  }
  const notation = result.data.trim();
  if (notation.length < 1 || notation.length > MAX_NOTATION_LENGTH) {
    throw new Error(
      `Saved roll notation must contain 1 through ${MAX_NOTATION_LENGTH} characters`,
    );
  }
  const prepared = prepareRollAppearance({
    notation: parseNotationArgs(notation),
    repetitions,
    seed: 0,
  });
  if (prepared.errors.length > 0 || prepared.outcomes.length === 0) {
    throw new Error("Saved roll notation is invalid");
  }
  return notation;
}

function parseRepetitions(value: SavedRollRepetitionsInput): number {
  const result = SavedRollRepetitionsSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Saved roll repetitions must be an integer from 1 through ${MAX_REPETITIONS}`,
    );
  }
  return result.data;
}

function parseTitle(value: SavedRollTitleInput): string | null {
  const result = SavedRollTitleSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Saved roll title must be null or contain 1 through ${MAX_TITLE_LENGTH} characters`,
    );
  }
  return result.data;
}

export function parseSavedRollDraftV1(
  value: SavedRollDraftV1Input,
): SavedRollDraftV1 {
  const result = SavedRollDraftV1Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Saved roll draft has invalid fields");
  }
  const repetitions = parseRepetitions(result.data.repetitions);
  const name = parseSavedRollNameV1(result.data.name);
  return {
    version: 1,
    ...name,
    notation: parseNotation(result.data.notation, repetitions),
    title: parseTitle(result.data.title),
    repetitions,
  };
}

export function parseSavedRollDraftV2(
  value: SavedRollDraftV2Input,
): SavedRollDraftV2 {
  const result = SavedRollDraftV2Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Library roll draft has invalid fields");
  }
  const repetitions = parseRepetitions(result.data.repetitions);
  const name = parseSavedRollNameV1(result.data.name);
  return {
    version: 2,
    ...name,
    nameColor: parseSavedRollNameColorV2(result.data.nameColor),
    notation: parseNotation(result.data.notation, repetitions),
    title: parseTitle(result.data.title),
    repetitions,
  };
}
