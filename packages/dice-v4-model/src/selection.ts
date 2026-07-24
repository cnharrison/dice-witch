import { isMaterialFormCompatibleV4 } from "./compatibility";
import type { DeterministicRandomV4 } from "./random";
import type {
  AppearanceSelection,
  MaterialFamilyV4,
  PolyhedralFormV4,
} from "./types";

export function resolveAppearanceSelectionV4<Value>(
  selection: AppearanceSelection<Value>,
  random: DeterministicRandomV4,
): Value {
  if (selection.mode === "fixed") return selection.value;
  if (selection.mode === "allowlist") {
    if (selection.values.length === 0) {
      throw new Error("Appearance selection is empty");
    }
    const value = selection.values[random.index(selection.values.length)];
    if (value === undefined) throw new Error("Appearance selection is empty");
    return value;
  }
  if (
    selection.options.length === 0 ||
    selection.options.some(
      (option) =>
        !Number.isSafeInteger(option.weight) || option.weight < 1,
    )
  ) {
    throw new Error(
      "Appearance selection weights must be positive safe integers",
    );
  }
  const total = selection.options.reduce(
    (sum, option) => sum + option.weight,
    0,
  );
  if (!Number.isSafeInteger(total)) {
    throw new Error(
      "Appearance selection weights must be positive safe integers",
    );
  }
  let selected = random.index(total);
  for (const option of selection.options) {
    if (selected < option.weight) return option.value;
    selected -= option.weight;
  }
  throw new Error("Appearance selection is empty");
}

export function resolveCompatiblePolyhedralFormV4(
  selection: AppearanceSelection<PolyhedralFormV4>,
  family: MaterialFamilyV4,
  random: DeterministicRandomV4,
): PolyhedralFormV4 {
  let compatible: AppearanceSelection<PolyhedralFormV4>;
  if (selection.mode === "fixed") {
    if (!isMaterialFormCompatibleV4(family, selection.value)) {
      throw new Error(`Appearance form selection has no option for ${family}`);
    }
    compatible = selection;
  } else if (selection.mode === "allowlist") {
    compatible = {
      mode: "allowlist",
      values: selection.values.filter((form) =>
        isMaterialFormCompatibleV4(family, form),
      ),
    };
  } else {
    compatible = {
      mode: "weighted",
      options: selection.options.filter((option) =>
        isMaterialFormCompatibleV4(family, option.value),
      ),
    };
  }
  if (
    (compatible.mode === "allowlist" && compatible.values.length === 0) ||
    (compatible.mode === "weighted" && compatible.options.length === 0)
  ) {
    throw new Error(`Appearance form selection has no option for ${family}`);
  }
  return resolveAppearanceSelectionV4(compatible, random);
}
