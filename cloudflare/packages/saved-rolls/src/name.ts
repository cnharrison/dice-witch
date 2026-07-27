import { countGraphemes } from "unicode-segmenter/grapheme";
import {
  UNICODE_ASSIGNED_RANGES,
  UNICODE_NFKC_CASEFOLD_RANGES,
} from "./unicode-16.generated";

export const SAVED_ROLL_UNICODE_VERSION = "16.0.0";
export const MAX_SAVED_ROLL_NAME_GRAPHEMES = 80;

export type SavedRollNameV1 = {
  displayName: string;
  comparisonKey: string;
};

type SearchRange = readonly [number, number, ...unknown[]];
type MappingRange = readonly [number, number, number | string];

const FORBIDDEN_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const WHITE_SPACE = /\p{White_Space}/u;

function rangeContaining<T extends SearchRange>(
  codePoint: number,
  ranges: readonly T[],
): T | undefined {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const range = ranges[middle];
    if (range === undefined) return undefined;
    if (codePoint < range[0]) high = middle - 1;
    else if (codePoint > range[1]) low = middle + 1;
    else return range;
  }
  return undefined;
}

function validateCharacters(value: string): void {
  if (FORBIDDEN_FORMAT.test(value)) {
    throw new Error("Saved roll name contains forbidden formatting");
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      rangeContaining(codePoint, UNICODE_ASSIGNED_RANGES) === undefined
    ) {
      throw new Error(
        `Saved roll name contains a character outside Unicode ${SAVED_ROLL_UNICODE_VERSION}`,
      );
    }
    if (character !== " " && WHITE_SPACE.test(character)) {
      throw new Error("Saved roll name contains forbidden whitespace");
    }
  }
}

function comparisonKey(value: string): string {
  let folded = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Saved roll name contains an invalid character");
    }
    const range = rangeContaining(
      codePoint,
      UNICODE_NFKC_CASEFOLD_RANGES as readonly MappingRange[],
    );
    if (range === undefined) {
      folded += character;
    } else if (typeof range[2] === "number") {
      folded += String.fromCodePoint(codePoint + range[2]);
    } else {
      folded += range[2];
    }
  }
  return folded.normalize("NFC");
}

export function parseSavedRollNameV1(value: unknown): SavedRollNameV1 {
  if (typeof value !== "string") {
    throw new Error("Saved roll name must be a string");
  }
  validateCharacters(value);
  const displayName = value.normalize("NFC").trim().replace(/ +/g, " ");
  const length = countGraphemes(displayName);
  if (length < 1 || length > MAX_SAVED_ROLL_NAME_GRAPHEMES) {
    throw new Error(
      `Saved roll name must contain 1 through ${MAX_SAVED_ROLL_NAME_GRAPHEMES} characters`,
    );
  }
  return { displayName, comparisonKey: comparisonKey(displayName) };
}
