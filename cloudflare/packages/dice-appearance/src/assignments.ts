import type {
  AppearanceProfileV1,
  AppearanceTarget,
  DesignReference,
} from "./types";

export function applyDesignToAll(
  profile: AppearanceProfileV1,
  reference: DesignReference,
): AppearanceProfileV1 {
  return {
    ...profile,
    assignments: { all: reference, overrides: {} },
  };
}

export function assignDesignToTarget(
  profile: AppearanceProfileV1,
  target: AppearanceTarget,
  reference: DesignReference,
): AppearanceProfileV1 {
  return {
    ...profile,
    assignments: {
      all: profile.assignments.all,
      overrides: { ...profile.assignments.overrides, [target]: reference },
    },
  };
}
