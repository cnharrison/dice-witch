import { canonicalJsonV4 } from "./random";
import type { PublicRenderModelV4, RenderRequestV4 } from "./types";
import { validateRenderRequestV4 } from "./validate-render-request";

export const MAX_RENDER_REQUEST_JSON_CHARACTERS_V4 = 96 * 1_024;

function requireBoundedJson(value: string): void {
  if (value.length > MAX_RENDER_REQUEST_JSON_CHARACTERS_V4) {
    throw new Error("Render request V4 JSON exceeds 98304 characters");
  }
}

export function serializeRenderRequestV4(value: unknown): string {
  const serialized = canonicalJsonV4(validateRenderRequestV4(value));
  requireBoundedJson(serialized);
  return serialized;
}

export function parseRenderRequestV4Json(value: string): RenderRequestV4 {
  requireBoundedJson(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Render request V4 JSON is invalid");
  }
  return validateRenderRequestV4(parsed);
}

export function parsePublicRenderModelV4(
  value: unknown,
): PublicRenderModelV4 {
  return validateRenderRequestV4(value);
}
