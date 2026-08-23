import type { AppearanceThumbVersionParts } from "@/lib/appearance-thumbs";
import {
  applyStringRows,
  stringRowsFromSelection,
  type StringRowState,
} from "@/lib/mix-picker-state";
import type { AppearanceCatalogV3, AppearanceRecipeV3 } from "@/types/appearance";
import type {
  AppearanceSelection,
  EngravingFinishV4,
  FontIdV4,
} from "@dice-witch/dice-v4-model";
import * as React from "react";

type MixPickerNumbersRowProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  thumbVersion?: AppearanceThumbVersionParts | null;
  disabled?: boolean;
  onChange(recipe: AppearanceRecipeV3): void;
};

// Authored rows stay fixed/allowlist; weighted selections are legacy
// procedural data and reset on the first explicit tap.
function toggleStringId<V extends string>(
  selection: AppearanceSelection<V>,
  id: V,
  legacy: boolean,
): AppearanceSelection<V> {
  if (legacy) return { mode: "fixed", value: id };
  const rows = stringRowsFromSelection(selection);
  const currentIds = rows.mode === "fixed" ? [rows.id] : [...rows.ids];
  const index = currentIds.indexOf(id);
  if (index >= 0) {
    if (currentIds.length === 1) return selection;
    const ids = currentIds.filter((_, position) => position !== index);
    const next: StringRowState<V> =
      ids.length === 1 ? { mode: "fixed", id: ids[0] } : { mode: "allowlist", ids };
    return applyStringRows(selection, next);
  }
  const next: StringRowState<V> =
    rows.mode === "fixed"
      ? { mode: "allowlist", ids: [rows.id, id] }
      : { mode: "allowlist", ids: [...rows.ids, id] };
  return applyStringRows(selection, next);
}

export function MixPickerNumbersRow({
  recipe,
  catalog,
  disabled = false,
  onChange,
}: MixPickerNumbersRowProps) {
  // Weighted string selections are legacy procedural data the picker never
  // authors; authored fixed/allowlist rows stay fully editable.
  const fontLegacy = recipe.font.mode === "weighted";
  const fontRows = stringRowsFromSelection(recipe.font);
  const inkRows = stringRowsFromSelection(recipe.engraving);
  const inkLegacy = recipe.engraving.mode === "weighted";
  const fontSelectedIds =
    fontRows.mode === "fixed" ? [fontRows.id] : [...fontRows.ids];
  const inkSelectedIds =
    inkRows.mode === "fixed" ? [inkRows.id] : [...inkRows.ids];

  const toggleFont = (id: FontIdV4) =>
    onChange({ ...recipe, font: toggleStringId(recipe.font, id, fontLegacy) });
  const toggleInk = (id: EngravingFinishV4) =>
    onChange({
      ...recipe,
      engraving: toggleStringId(recipe.engraving, id, inkLegacy),
    });

  return (
    <section aria-label="Numbers">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Numbers
        </h3>
        <p className="text-xs text-muted-foreground">Previews on neutral resin</p>
      </header>
      <div
        role="group"
        aria-label="Font"
        className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {fontLegacy && (
          <span className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/60 px-2 py-1 text-xs text-muted-foreground">
            Procedural mix · pick to replace
          </span>
        )}
        {catalog.fonts.map(({ id, name }) => {
          const selected = !fontLegacy && fontSelectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggleFont(id)}
              style={{ fontFamily: `DiceWitchV4-${id}` }}
              className={`min-h-11 shrink-0 snap-start rounded-md border px-3 py-2 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "border-brand bg-brand/10"
                  : "border-border hover:border-brand/50 hover:bg-muted/40"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div
        role="group"
        aria-label="Engraving finish"
        className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {inkLegacy && (
          <span className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/60 px-2 py-1 text-xs text-muted-foreground">
            Weighted mix · pick to replace
          </span>
        )}
        {catalog.engravingFinishes.map(({ id, name }) => {
          const selected = !inkLegacy && inkSelectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggleInk(id)}
              className={`shrink-0 snap-start rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "border-brand bg-brand/10"
                  : "border-border hover:border-brand/50 hover:bg-muted/40"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
