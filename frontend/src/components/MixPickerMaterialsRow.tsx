import { AppearanceThumb } from "@/components/AppearanceThumb";
import type { AppearanceThumbVersionParts } from "@/lib/appearance-thumbs";
import {
  applyMaterialRows,
  materialRowsFromRecipe,
  type MaterialRowState,
} from "@/lib/mix-picker-state";
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

function percentOf(weight: number, total: number): number {
  return Math.round((weight / total) * 100);
}

function applyMaterialWeights(
  recipe: AppearanceRecipeV3,
  weights: readonly number[],
): AppearanceRecipeV3 {
  if (
    recipe.material.mode !== "weighted" ||
    recipe.material.options.length !== weights.length
  ) {
    throw new Error("Material mix weights do not match the recipe");
  }
  return {
    ...recipe,
    material: {
      mode: "weighted",
      options: recipe.material.options.map((option, index) => ({
        ...option,
        weight: weights[index] as number,
      })),
    },
  };
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
      <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] sm:overflow-visible">
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
              className={`group relative flex w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
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
          onCommit={(weights) => onChange(applyMaterialWeights(recipe, weights))}
        />
      )}
    </section>
  );
}

// Tiny segments keep accessible labels without forcing a minimum visual width.
const MIN_LABELED_PERCENT = 5;

function boundaryPercentages(
  weights: readonly number[],
  total: number,
): number[] {
  let cumulative = 0;
  return weights.slice(0, -1).map((weight) => {
    cumulative += weight;
    return (cumulative / total) * 100;
  });
}

// Segment handles rebalance the two adjacent shares live; the pair total is
// conserved so other segments never move during a drag.
export function MixBar({
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
  // Recipe weights are ratios, not shares of a fixed total: presets ship
  // weights summing to anything, so percentages derive from the actual sum.
  const total = displayed.reduce((sum, weight) => sum + weight, 0);
  const stepUnits = Math.max(
    APPEARANCE_SELECTION_WEIGHT_RANGE_V3.step,
    Math.round(total / 100),
  );
  const boundaryPositions = boundaryPercentages(displayed, total);
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
      ((clientX - drag.startX) / bar.clientWidth) * total,
    );
    const boundary = drag.boundary;
    const pairTotal =
      drag.startWeights[boundary] + drag.startWeights[boundary + 1];
    const { minimum, maximum } = APPEARANCE_SELECTION_WEIGHT_RANGE_V3;
    const minimumLeft = Math.max(minimum, pairTotal - maximum);
    const maximumLeft = Math.min(maximum, pairTotal - minimum);
    const left = Math.min(
      Math.max(drag.startWeights[boundary] + delta, minimumLeft),
      maximumLeft,
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
    const { minimum, maximum } = APPEARANCE_SELECTION_WEIGHT_RANGE_V3;
    const left = displayed[boundary];
    const right = displayed[boundary + 1];
    const available =
      direction === 1
        ? Math.min(maximum - left, right - minimum)
        : Math.min(left - minimum, maximum - right);
    const change = Math.min(stepUnits, available);
    if (change <= 0) return;
    const next = [...displayed];
    next[boundary] += direction * change;
    next[boundary + 1] -= direction * change;
    onCommit(next);
  };

  return (
    <div className="relative mt-3 h-11">
      <div
        ref={barRef}
        role="group"
        aria-label="Material mix balance"
        className="absolute inset-x-0 top-1/2 flex h-6 -translate-y-1/2 overflow-hidden rounded-md border border-border"
      >
        {displayed.map((weight, index) => {
          const percent = percentOf(weight, total);
          return (
            <div
              key={`${names[index]}-${index}`}
              style={{ flexBasis: 0, flexGrow: weight }}
              title={`${names[index]}: ${percent}%`}
              className={`grid min-w-0 place-items-center overflow-hidden whitespace-nowrap text-[0.65rem] font-semibold ${
                index % 2 === 0 ? "bg-brand/25" : "bg-muted"
              }`}
            >
              {percent >= MIN_LABELED_PERCENT ? (
                `${percent}%`
              ) : (
                <span className="sr-only">{percent}%</span>
              )}
            </div>
          );
        })}
      </div>
      {displayed.slice(0, -1).map((_, boundary) => (
        <button
          key={boundary}
          type="button"
          role="slider"
          aria-label={`Balance ${names[boundary]} and ${names[boundary + 1]}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentOf(displayed[boundary], total)}
          disabled={disabled}
          style={{ left: `${boundaryPositions[boundary]}%` }}
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
          className="absolute top-0 h-11 w-5 -translate-x-1/2 touch-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:left-1/2 after:top-1/2 after:h-6 after:w-px after:-translate-x-1/2 after:-translate-y-1/2 after:bg-muted-foreground/60 disabled:opacity-50"
        />
      ))}
    </div>
  );
}
