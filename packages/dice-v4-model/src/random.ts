import { canonicalJsonV4 } from "./canonical-json";
import {
  APPEARANCE_TARGETS_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
} from "./registries";
import type {
  AppearanceTargetV4,
  AppearanceVariationScopeV3,
  AppearanceVariationV3,
} from "./types";

const UINT32_MAX = 0xffff_ffff;
const STREAM_NAME = /^[a-z][a-z0-9-]*$/;

export type DeterministicRandomV4 = {
  nextUint32(): number;
  nextFloat(): number;
  index(length: number): number;
};

export type AppearanceSeedInputV4 = {
  renderSeed: number;
  target: AppearanceTargetV4;
  groupIndex: number;
  dieIndex: number;
  groupIdentity?: string;
  dieIdentity?: string;
  variation: AppearanceVariationV3;
  varyBy: AppearanceVariationScopeV3;
  recipe: unknown;
};

function requireUint32(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error("Deterministic seed must be an unsigned 32-bit integer");
  }
}

export function createDeterministicRandomV4(
  seed: number,
): DeterministicRandomV4 {
  requireUint32(seed);
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
  return {
    nextUint32,
    nextFloat: () => nextUint32() / 0x1_0000_0000,
    index(length): number {
      if (!Number.isSafeInteger(length) || length < 1) {
        throw new Error(
          "Deterministic selection must be a non-empty safe length",
        );
      }
      return nextUint32() % length;
    },
  };
}

export function hashStringV4(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

export { canonicalJsonV4 } from "./canonical-json";

function requireResolutionContext(input: AppearanceSeedInputV4): void {
  requireUint32(input.renderSeed);
  if (!APPEARANCE_TARGETS_V4.includes(input.target)) {
    throw new Error("Appearance seed target is not supported");
  }
  if (!Number.isSafeInteger(input.groupIndex) || input.groupIndex < 0) {
    throw new Error("Appearance seed group index must be non-negative");
  }
  if (!Number.isSafeInteger(input.dieIndex) || input.dieIndex < 0) {
    throw new Error("Appearance seed die index must be non-negative");
  }
  for (const identity of [input.groupIdentity, input.dieIdentity]) {
    if (
      identity !== undefined &&
      (identity.length < 1 || identity.length > 256)
    ) {
      throw new Error("Appearance seed identity is invalid");
    }
  }
  if (!APPEARANCE_VARIATIONS_V3.includes(input.variation)) {
    throw new Error("Appearance seed variation is not supported");
  }
  if (!APPEARANCE_VARIATION_SCOPES_V3.includes(input.varyBy)) {
    throw new Error("Appearance seed scope is not supported");
  }
}

export function deriveAppearanceSeedV4(
  input: AppearanceSeedInputV4,
): number {
  requireResolutionContext(input);
  if (input.variation === "fixed") {
    return hashStringV4(`fixed:${canonicalJsonV4(input.recipe)}`);
  }
  if (input.varyBy === "roll") {
    return hashStringV4(`${input.renderSeed}:roll:${input.variation}`);
  }
  if (input.varyBy === "group") {
    return hashStringV4(
      input.groupIdentity === undefined
        ? `${input.renderSeed}:group:${input.groupIndex}:${input.variation}`
        : `${input.renderSeed}:group-id:${input.groupIdentity}:${input.variation}`,
    );
  }
  return hashStringV4(
    input.dieIdentity === undefined
      ? `${input.renderSeed}:die:${input.groupIndex}:${input.dieIndex}:${input.target}:${input.variation}`
      : `${input.renderSeed}:die-id:${input.dieIdentity}:${input.target}:${input.variation}`,
  );
}

export function deriveNamedSeedV4(seed: number, stream: string): number {
  requireUint32(seed);
  if (
    stream.length < 1 ||
    stream.length > 64 ||
    !STREAM_NAME.test(stream)
  ) {
    throw new Error(
      "Deterministic stream name must be from 1 through 64 characters",
    );
  }
  return hashStringV4(`${seed}:${stream}`);
}
