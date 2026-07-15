import {
  MAX_ROLL_DELAY_MS,
  MIN_ROLL_DELAY_MS,
} from "./constants";

export type DeterministicRandom = {
  nextUint32: () => number;
  nextInt32: () => number;
  nextFloat: () => number;
};

export function selectRollDelayMs(randomUnit: number): number {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit >= 1) {
    throw new Error("Roll delay random value must be in [0, 1)");
  }
  return Math.floor(randomUnit * MAX_ROLL_DELAY_MS) + MIN_ROLL_DELAY_MS;
}

export function createDeterministicRandom(seed: number): DeterministicRandom {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Random seed must be an unsigned 32-bit integer");
  }
  let state = seed >>> 0;
  const nextUint32 = () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
  return {
    nextUint32,
    nextInt32: () => nextUint32() | 0,
    nextFloat: () => nextUint32() / 2 ** 32,
  };
}
