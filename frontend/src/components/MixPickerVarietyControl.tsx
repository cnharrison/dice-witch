import {
  varietyFromRecipe,
  type MixPickerVariety,
} from "@/lib/mix-picker-state";
import type { AppearanceRecipeV3 } from "@/types/appearance";
import * as React from "react";

type MixPickerVarietyControlProps = {
  recipe: AppearanceRecipeV3;
  isChaosAssignment: boolean;
  disabled?: boolean;
  onSelect(variety: Exclude<MixPickerVariety, "chaos">): void;
  // Chaos swaps the target's assignment to the builtin Random style at the
  // profile level; the panel cannot express it as a recipe edit.
  onChaos(): void;
};

const OPTIONS: Readonly<
  Record<MixPickerVariety, { label: string; caption: string }>
> = Object.freeze({
  matched: { label: "Matched set", caption: "One draw for the whole roll." },
  mixed: {
    label: "Mixed bag",
    caption: "Every die draws its own combo from your mix.",
  },
  chaos: {
    label: "Chaos",
    caption: "The built-in Random look takes over.",
  },
});

export function MixPickerVarietyControl({
  recipe,
  isChaosAssignment,
  disabled = false,
  onSelect,
  onChaos,
}: MixPickerVarietyControlProps) {
  const selected = varietyFromRecipe(recipe, isChaosAssignment);
  return (
    <section aria-label="Variety">
      <h3 className="text-xs font-semibold uppercase tracking-wide">Variety</h3>
      <div role="group" className="mt-2 flex gap-1 rounded-lg border p-1">
        {(Object.keys(OPTIONS) as MixPickerVariety[]).map((variety) => (
          <button
            key={variety}
            type="button"
            aria-pressed={selected === variety}
            disabled={disabled}
            onClick={() =>
              variety === "chaos" ? onChaos() : onSelect(variety)
            }
            className={`min-h-9 flex-1 rounded-md px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected === variety
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {OPTIONS[variety].label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">
        {OPTIONS[selected].caption}
      </p>
    </section>
  );
}
