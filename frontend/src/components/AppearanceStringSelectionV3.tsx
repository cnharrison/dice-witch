import type { AppearanceSelection } from "@dice-witch/dice-v4-model";
import {
  formatMaterialWeightPercentV3,
  normalizeMaterialWeightsV3,
  updateMaterialWeightV3,
} from "@/lib/material-weight-percentages";
import * as React from "react";
import { AppearanceSelectV3 } from "./AppearanceSelectV3";

type Option<Value extends string> = Readonly<{
  id: Value;
  name: string;
}>;

type WeightBounds = Readonly<{
  minimum: number;
  maximum: number;
  step: number;
}>;

function requireWeightV3(weight: number | undefined): number {
  if (weight === undefined) {
    throw new Error("Appearance selection weight is missing");
  }
  return weight;
}

function selectedValues<Value extends string>(
  selection: AppearanceSelection<Value>,
): readonly Value[] {
  switch (selection.mode) {
    case "fixed":
      return [selection.value];
    case "allowlist":
      return selection.values;
    case "weighted":
      return selection.options.map(({ value }) => value);
  }
}

export function AppearanceStringSelectionV3<Value extends string>({
  label,
  selection,
  options,
  weightBounds,
  maximumTotalWeight,
  disabledReasons = {},
  onChange,
}: {
  label: string;
  selection: AppearanceSelection<Value>;
  options: readonly Option<Value>[];
  weightBounds: WeightBounds;
  maximumTotalWeight: number;
  disabledReasons?: Partial<Record<Value, string>>;
  onChange(selection: AppearanceSelection<Value>): void;
}) {
  const id = React.useId();
  const [error, setError] = React.useState<string | null>(null);
  const values = selectedValues(selection);
  const selected = new Set(values);
  const visibleOptions = options.filter(
    ({ id: option }) =>
      disabledReasons[option] === undefined || selected.has(option),
  );
  const normalizedWeights = normalizeMaterialWeightsV3(
    selection.mode === "weighted"
      ? selection.options.map(({ weight }) => weight)
      : values.map(() => weightBounds.minimum),
  );
  const weights = new Map(
    values.map((value, index) => [
      value,
      requireWeightV3(normalizedWeights[index]),
    ]),
  );

  const emit = (next: AppearanceSelection<Value>) => {
    setError(null);
    onChange(next);
  };

  const emitWeighted = (
    next: Extract<AppearanceSelection<Value>, { mode: "weighted" }>,
  ) => {
    const total = next.options.reduce((sum, option) => sum + option.weight, 0);
    if (total > maximumTotalWeight) {
      setError(`Total selection weight cannot exceed ${maximumTotalWeight}.`);
      return;
    }
    emit(next);
  };

  const changeMode = (mode: AppearanceSelection<Value>["mode"]) => {
    const first = values[0];
    if (first === undefined) {
      setError(`Select at least one ${label.toLowerCase()} option.`);
      return;
    }
    if (mode === "fixed") {
      emit({ mode, value: first });
    } else if (mode === "allowlist") {
      emit({ mode, values: [...values] });
    } else {
      emitWeighted({
        mode,
        options: values.map((value) => ({
          value,
          weight: requireWeightV3(weights.get(value)),
        })),
      });
    }
  };

  const toggle = (value: Value) => {
    const nextValues = selected.has(value)
      ? values.filter((candidate) => candidate !== value)
      : options
          .map(({ id: option }) => option)
          .filter((option) => selected.has(option) || option === value);
    if (nextValues.length === 0) {
      setError(`Select at least one ${label.toLowerCase()} option.`);
      return;
    }
    if (selection.mode === "allowlist") {
      emit({ mode: "allowlist", values: [...nextValues] });
      return;
    }
    if (selection.mode === "weighted") {
      const nextWeights = normalizeMaterialWeightsV3(
        nextValues.map((option) =>
          selected.has(option)
            ? requireWeightV3(weights.get(option))
            : weightBounds.minimum,
        ),
      );
      emitWeighted({
        mode: "weighted",
        options: nextValues.map((option, index) => ({
          value: option,
          weight: requireWeightV3(nextWeights[index]),
        })),
      });
    }
  };

  const setWeight = (value: Value, weight: number) => {
    if (selection.mode !== "weighted") return;
    const index = selection.options.findIndex((option) => option.value === value);
    if (index < 0) throw new Error(`${label} weighted option is missing`);
    const nextWeights = updateMaterialWeightV3(
      selection.options.map((option) =>
        requireWeightV3(weights.get(option.value)),
      ),
      index,
      weight,
    );
    emitWeighted({
      mode: "weighted",
      options: selection.options.map((option, optionIndex) => ({
        ...option,
        weight: requireWeightV3(nextWeights[optionIndex]),
      })),
    });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <label className="block space-y-1.5 text-xs font-medium">
        <span className="block">Selection behavior</span>
        <AppearanceSelectV3
          id={`${id}-mode`}
          aria-label={`${label} mode`}
          value={selection.mode}
          onChange={(event) =>
            changeMode(event.target.value as AppearanceSelection<Value>["mode"])
          }
          containerClassName="sm:max-w-xs"
        >
          <option value="fixed">One value</option>
          <option value="allowlist">Allowed values</option>
          <option value="weighted">Weighted values</option>
        </AppearanceSelectV3>
      </label>

      {selection.mode === "fixed" ? (
        <label className="block space-y-1.5 text-xs font-medium">
          <span className="block">{label}</span>
          <AppearanceSelectV3
            aria-label={label}
            value={selection.value}
            onChange={(event) =>
              emit({ mode: "fixed", value: event.target.value as Value })
            }
            containerClassName="sm:max-w-xs"
          >
            {visibleOptions.map((option) => (
              <option
                key={option.id}
                value={option.id}
                disabled={
                  disabledReasons[option.id] !== undefined &&
                  option.id !== selection.value
                }
              >
                {option.name}
              </option>
            ))}
          </AppearanceSelectV3>
        </label>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2">
          {visibleOptions.map((option) => {
            const reason = disabledReasons[option.id];
            const checked = selected.has(option.id);
            return (
              <div
                key={option.id}
                className="rounded-md border bg-background p-3"
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={reason !== undefined && !checked}
                    onChange={() => toggle(option.id)}
                  />
                  {option.name}
                </label>
                {selection.mode === "weighted" && checked && (
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>{option.name} share</span>
                      <span aria-hidden="true">
                        {formatMaterialWeightPercentV3(
                          requireWeightV3(weights.get(option.id)),
                        )}
                      </span>
                    </span>
                    <input
                      aria-label={`${option.name} share`}
                      aria-valuetext={formatMaterialWeightPercentV3(
                        requireWeightV3(weights.get(option.id)),
                      )}
                      type="range"
                      min={weightBounds.minimum}
                      max={
                        weightBounds.maximum -
                        (selection.options.length - 1) * weightBounds.minimum
                      }
                      step={weightBounds.step}
                      value={requireWeightV3(weights.get(option.id))}
                      onChange={(event) =>
                        setWeight(option.id, event.currentTarget.valueAsNumber)
                      }
                      className="h-11 w-full accent-fuchsia-500 sm:h-9"
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
