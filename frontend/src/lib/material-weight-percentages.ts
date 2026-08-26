import { APPEARANCE_SELECTION_WEIGHT_RANGE_V3 } from "@dice-witch/dice-v4-model";

const MINIMUM_WEIGHT_V3 = APPEARANCE_SELECTION_WEIGHT_RANGE_V3.minimum;
export const MATERIAL_WEIGHT_TOTAL_V3 =
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3.maximum;

function requireWeightsV3(weights: readonly number[]): void {
  if (
    weights.length < 1 ||
    weights.some(
      (weight) =>
        !Number.isInteger(weight) ||
        weight < APPEARANCE_SELECTION_WEIGHT_RANGE_V3.minimum ||
        weight > APPEARANCE_SELECTION_WEIGHT_RANGE_V3.maximum,
    )
  ) {
    throw new Error("Material weights are invalid");
  }
}

function requireRelativeWeightsV3(weights: readonly number[]): void {
  if (
    weights.length < 1 ||
    weights.some((weight) => !Number.isSafeInteger(weight) || weight < 1)
  ) {
    throw new Error("Relative material weights are invalid");
  }
}

function allocateWeightsV3(
  weights: readonly number[],
  total: number,
): number[] {
  requireRelativeWeightsV3(weights);
  if (!Number.isInteger(total) || total < weights.length * MINIMUM_WEIGHT_V3) {
    throw new Error("Material weight total is invalid");
  }
  const currentTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (currentTotal === total) return [...weights];

  const quotas = weights.map((weight) => (weight / currentTotal) * total);
  const allocated = quotas.map((quota) =>
    Math.max(MINIMUM_WEIGHT_V3, Math.floor(quota)),
  );
  let allocatedTotal = allocated.reduce((sum, weight) => sum + weight, 0);

  while (allocatedTotal < total) {
    let selectedIndex = 0;
    let selectedDeficit = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < allocated.length; index += 1) {
      // SAFETY: The surrounding validation establishes the number invariant used below.
      const deficit = (quotas[index] as number) - (allocated[index] as number);
      if (deficit > selectedDeficit) {
        selectedDeficit = deficit;
        selectedIndex = index;
      }
    }
    // SAFETY: The surrounding validation establishes the number invariant used below.
    allocated[selectedIndex] = (allocated[selectedIndex] as number) + 1;
    allocatedTotal += 1;
  }

  while (allocatedTotal > total) {
    let selectedIndex = -1;
    let selectedDeficit = Number.POSITIVE_INFINITY;
    for (let index = 0; index < allocated.length; index += 1) {
      // SAFETY: The surrounding validation establishes the number invariant used below.
      const weight = allocated[index] as number;
      if (weight <= MINIMUM_WEIGHT_V3) continue;
      // SAFETY: The surrounding validation establishes the number invariant used below.
      const deficit = (quotas[index] as number) - weight;
      if (deficit < selectedDeficit) {
        selectedDeficit = deficit;
        selectedIndex = index;
      }
    }
    if (selectedIndex < 0) {
      throw new Error("Material weights cannot be normalized");
    }
    // SAFETY: The surrounding validation establishes the number invariant used below.
    allocated[selectedIndex] = (allocated[selectedIndex] as number) - 1;
    allocatedTotal -= 1;
  }

  return allocated;
}

export function normalizeMaterialWeightsV3(
  weights: readonly number[],
): number[] {
  return allocateWeightsV3(weights, MATERIAL_WEIGHT_TOTAL_V3);
}

export function updateMaterialWeightV3(
  weights: readonly number[],
  index: number,
  requestedWeight: number,
): number[] {
  requireWeightsV3(weights);
  if (!Number.isSafeInteger(index) || index < 0 || index >= weights.length) {
    throw new Error("Material weight index is invalid");
  }
  if (!Number.isInteger(requestedWeight)) {
    throw new Error("Material weight is invalid");
  }
  if (weights.length === 1) return [MATERIAL_WEIGHT_TOTAL_V3];

  const maximum = MATERIAL_WEIGHT_TOTAL_V3 -
    (weights.length - 1) * MINIMUM_WEIGHT_V3;
  const nextWeight = Math.max(
    MINIMUM_WEIGHT_V3,
    Math.min(maximum, requestedWeight),
  );
  const otherWeights = weights.filter((_weight, candidate) => candidate !== index);
  const allocatedOthers = allocateWeightsV3(
    otherWeights,
    MATERIAL_WEIGHT_TOTAL_V3 - nextWeight,
  );
  let otherIndex = 0;
  return weights.map((_weight, candidate) => {
    if (candidate === index) return nextWeight;
    const value = allocatedOthers[otherIndex];
    otherIndex += 1;
    if (value === undefined) throw new Error("Material weight allocation failed");
    return value;
  });
}

export function addMaterialWeightV3(weights: readonly number[]): number[] {
  requireWeightsV3(weights);
  const newWeight = Math.max(
    MINIMUM_WEIGHT_V3,
    Math.round(MATERIAL_WEIGHT_TOTAL_V3 / (weights.length + 1)),
  );
  return [
    ...allocateWeightsV3(weights, MATERIAL_WEIGHT_TOTAL_V3 - newWeight),
    newWeight,
  ];
}

export function removeMaterialWeightV3(
  weights: readonly number[],
  index: number,
): number[] {
  requireWeightsV3(weights);
  if (
    weights.length < 2 ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= weights.length
  ) {
    throw new Error("Material weight removal is invalid");
  }
  return normalizeMaterialWeightsV3(
    weights.filter((_weight, candidate) => candidate !== index),
  );
}

export function formatMaterialWeightPercentV3(weight: number): string {
  if (!Number.isInteger(weight) || weight < MINIMUM_WEIGHT_V3) {
    throw new Error("Material weight is invalid");
  }
  return `${String(Number((weight / 10).toFixed(1)))}%`;
}
