import {
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
  parseNotationArgs,
  prepareRollAppearance,
} from "../../roll-domain/src";
import { parseSavedRollNameV1 } from "./name";

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

const HEX_COLOR = /^#[0-9A-F]{6}$/u;

export function parseSavedRollNameColorV2(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error("Library roll name color must be null or uppercase #RRGGBB");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseNotation(value: unknown, repetitions: number): string {
  if (typeof value !== "string") {
    throw new Error("Saved roll notation must be a string");
  }
  const notation = value.trim();
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

function parseRepetitions(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_REPETITIONS
  ) {
    throw new Error(
      `Saved roll repetitions must be an integer from 1 through ${MAX_REPETITIONS}`,
    );
  }
  return value;
}

function parseTitle(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_TITLE_LENGTH
  ) {
    throw new Error(
      `Saved roll title must be null or contain 1 through ${MAX_TITLE_LENGTH} characters`,
    );
  }
  return value;
}

export function parseSavedRollDraftV1(value: unknown): SavedRollDraftV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "name",
      "notation",
      "repetitions",
      "title",
      "version",
    ]) ||
    value.version !== 1
  ) {
    throw new Error("Saved roll draft has invalid fields");
  }
  const repetitions = parseRepetitions(value.repetitions);
  const name = parseSavedRollNameV1(value.name);
  return {
    version: 1,
    ...name,
    notation: parseNotation(value.notation, repetitions),
    title: parseTitle(value.title),
    repetitions,
  };
}

export function parseSavedRollDraftV2(value: unknown): SavedRollDraftV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "name",
      "nameColor",
      "notation",
      "repetitions",
      "title",
      "version",
    ]) ||
    value.version !== 2
  ) {
    throw new Error("Library roll draft has invalid fields");
  }
  const repetitions = parseRepetitions(value.repetitions);
  const name = parseSavedRollNameV1(value.name);
  return {
    version: 2,
    ...name,
    nameColor: parseSavedRollNameColorV2(value.nameColor),
    notation: parseNotation(value.notation, repetitions),
    title: parseTitle(value.title),
    repetitions,
  };
}
