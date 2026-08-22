import { AppearanceThumb } from "@/components/AppearanceThumb";
import type { AppearanceThumbVersionParts } from "@/lib/appearance-thumbs";
import {
  applyMaterialRows,
  materialRowsFromRecipe,
  type MaterialRowState,
} from "@/lib/mix-picker-state";
import { MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import {
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import * as React from "react";

type MixPickerMaterialsRowProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  thumbVersion: AppearanceThumbVersionParts | null;
  disabled?: boolean;
  onChange(recipe: AppearanceRecipeV3): void;
};

function percentLabel(weight: number): string {
  return `${Math.round((weight / MATERIAL_WEIGHT_TOTAL_V3) * 100)}%`;
}

export function MixPickerMaterialsRow({
  recipe,
  catalog,
  thumbVersion,
  disabled = false,
  onChange,
}: MixPickerMaterialsRowProps) {
  const rows = materialRowsFromRecipe(recipe);

  const resolveMaterial = React.useCallback(
    (family: string): AppearanceMaterialV4 => {
      const entry = catalog.materials.find(
        ({ family: candidate }) => candidate === family,
      );
      if (entry === undefined) {
        throw new Error(`Appearance material catalog is missing: ${family}`);
      }
      return structuredClone(entry.defaultValue);
    },
    [catalog],
  );

  const toggleFamily = (family: string) => {
    const index = rows.families.indexOf(family);
    if (index >= 0) {
      // A mix always keeps at least one material.
      if (rows.families.length === 1) return;
      const families = rows.families.filter(
        (_, position) => position !== index,
      );
      const next: MaterialRowState =
        families.length === 1
          ? { mode: "fixed", families }
          : rows.mode === "weighted"
            ? {
                mode: "weighted",
                families,
                weights: rows.weights.filter(
                  (_, position) => position !== index,
                ),
              }
            : { mode: "allowlist", families };
      onChange(applyMaterialRows(recipe, next, resolveMaterial));
      return;
    }
    const families = [...rows.families, family];
    // Joining a weighted mix takes the smallest current share so existing
    // ratios survive the rebalance to the shared total.
    const next: MaterialRowState =
      rows.mode === "weighted"
        ? {
            mode: "weighted",
            families,
            weights: [...rows.weights, Math.min(...rows.weights)],
          }
        : { mode: "allowlist", families };
    onChange(applyMaterialRows(recipe, next, resolveMaterial));
  };

  return (
    <section aria-label="Material">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Material
        </h3>
        <p className="text-xs text-muted-foreground">Tap several to mix</p>
      </header>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
        {catalog.materials.map(({ family, name }) => {
          const selected = rows.families.includes(family);
          const lastSelected = selected && rows.families.length === 1;
          return (
            <button
              key={family}
              type="button"
              disabled={disabled || lastSelected}
              aria-pressed={selected}
              onClick={() => toggleFamily(family)}
              className={`group relative flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "border-brand bg-brand/10"
                  : "border-border hover:border-brand/50 hover:bg-muted/40"
              }`}
            >
              <span className="grid h-12 w-full place-items-center">
                {thumbVersion !== null && (
                  <AppearanceThumb
                    kind="material"
                    id={family}
                    catalogVersion={thumbVersion.catalogVersion}
                    rendererRevision={thumbVersion.rendererRevision}
                    alt=""
                  />
                )}
              </span>
              <span className="flex items-center gap-1">
                {selected && (
                  <span aria-hidden="true" className="text-brand">✓</span>
                )}
                {name}
              </span>
              <span className="sr-only">
                {selected
                  ? lastSelected
                    ? "(last material in mix)"
                    : ", selected"
                  : ""}
              </span>
            </button>
          );
        })}
      </div>
      {rows.mode === "weighted" && rows.weights.length > 1 && (
        <MixBar
          names={rows.families.map((family) =>
            catalog.materials.find(({ family: candidate }) => candidate === family)
              ?.name ?? family,
          )}
          weights={rows.weights}
          disabled={disabled}
          onCommit={(weights) =>
            onChange(
              applyMaterialRows(
                recipe,
                { mode: "weighted", families: rows.families, weights },
                resolveMaterial,
              ),
            )
          }
        />
      )}
    </section>
  );
}

const HANDLE_STEP_UNITS = Math.max(
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3.step,
  Math.round(MATERIAL_WEIGHT_TOTAL_V3 / 100),
);

function clampWeight(value: number): number {
  const { minimum } = APPEARANCE_SELECTION_WEIGHT_RANGE_V3;
  return Math.max(minimum, Math.min(MATERIAL_WEIGHT_TOTAL_V3, value));
}

// Segment handles rebalance the two adjacent shares live; the pair total is
// conserved so other segments never move during a drag.
function MixBar({
  names,
  weights,
  disabled,
  onCommit,
}: {
  names: readonly string[];
  weights: readonly number[];
  disabled: boolean;
  onCommit(weights: readonly number[]): void;
}) {
  const [dragWeights, setDragWeights] =
    React.useState<readonly number[] | null>(null);
  const displayed = dragWeights ?? weights;
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    boundary: number;
    startX: number;
    startWeights: readonly number[];
  } | null>(null);

  const moveDrag = (clientX: number) => {
    const drag = dragRef.current;
    const bar = barRef.current;
    if (drag === null || bar === null || bar.clientWidth <= 0) return;
    const delta = Math.round(
      ((clientX - drag.startX) / bar.clientWidth) * MATERIAL_WEIGHT_TOTAL_V3,
    );
    const boundary = drag.boundary;
    const pairTotal =
      drag.startWeights[boundary] + drag.startWeights[boundary + 1];
    const left = Math.min(
      Math.max(drag.startWeights[boundary] + delta, HANDLE_STEP_UNITS),
      pairTotal - HANDLE_STEP_UNITS,
    );
    const next = [...drag.startWeights];
    next[boundary] = left;
    next[boundary + 1] = pairTotal - left;
    setDragWeights(next);
  };

  const endDrag = () => {
    if (dragRef.current === null) return;
    dragRef.current = null;
    setDragWeights((current) => {
      if (current !== null) onCommit(current);
      return null;
    });
  };

  const nudge = (boundary: number, direction: -1 | 1) => {
    const left = clampWeight(displayed[boundary] + direction * HANDLE_STEP_UNITS);
    const right = clampWeight(
      displayed[boundary + 1] - direction * HANDLE_STEP_UNITS,
    );
    if (left + right !== displayed[boundary] + displayed[boundary + 1]) return;
    const next = [...displayed];
    next[boundary] = left;
    next[boundary + 1] = right;
    onCommit(next);
  };

  return (
    <div className="mt-3">
      <div
        ref={barRef}
        role="group"
        aria-label="Material mix balance"
        className="flex h-6 w-full overflow-hidden rounded-md border border-border"
      >
        {displayed.map((weight, index) => (
          <div
            key={`${names[index]}-${index}`}
            style={{ flexGrow: weight }}
            className={`grid place-items-center text-[0.65rem] font-semibold ${
              index % 2 === 0 ? "bg-brand/25" : "bg-muted"
            }`}
          >
            {percentLabel(weight)}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-end gap-2">
        {weights.slice(0, -1).map((_, boundary) => (
          <button
            key={boundary}
            type="button"
            role="slider"
            aria-label={`Balance ${names[boundary]} and ${names[boundary + 1]}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (displayed[boundary] / MATERIAL_WEIGHT_TOTAL_V3) * 100,
            )}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                nudge(boundary, -1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                nudge(boundary, 1);
              }
            }}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                boundary,
                startX: event.clientX,
                startWeights: [...displayed],
              };
            }}
            onPointerMove={(event) => {
              if (dragRef.current !== null) moveDrag(event.clientX);
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="h-8 w-4 touch-none rounded border border-dashed border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        ))}
      </div>
    </div>
  );
}
