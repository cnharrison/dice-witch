import { z } from "zod";

const SavedRollNameColorV2Schema = z.union([
  z.null(),
  z.string().regex(/^#[0-9A-F]{6}$/),
]);
type SavedRollNameColorV2Input = Parameters<
  typeof SavedRollNameColorV2Schema.parse
>[0];

export function parseSavedRollNameColorV2(
  value: SavedRollNameColorV2Input,
): string | null {
  const result = SavedRollNameColorV2Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Library roll name color must be null or uppercase #RRGGBB");
  }
  return result.data;
}
