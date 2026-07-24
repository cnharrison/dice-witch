import {
  GRADIENT_DIRECTIONS,
  GRADIENT_SCOPES,
  LIGHTING_DIRECTIONS,
  LIGHTING_MODES,
  LIGHTING_STRENGTHS,
  type AppearanceTreatmentOption,
} from "@/components/appearance-treatment-options";
import {
  formatMaterialWeightPercentV3 as formatWeightPercent,
  normalizeMaterialWeightsV3 as normalizeWeights,
  updateMaterialWeightV3 as updateWeightShare,
} from "@/lib/material-weight-percentages";
import type {
  AppearanceRecipeV2,
  AppearanceSelection,
} from "@/types/appearance";

const MAX_WEIGHT = 1_000;

type SelectionMode = AppearanceSelection<string>["mode"];

function requireWeight(weight: number | undefined): number {
  if (weight === undefined) {
    throw new Error("Appearance treatment weight is missing");
  }
  return weight;
}

function selectedValues<Value extends string>(
  selection: AppearanceSelection<Value>,
): Value[] {
  if (selection.mode === "fixed") return [selection.value];
  if (selection.mode === "allowlist") return selection.values;
  return selection.options.map(({ value }) => value);
}

function selectedWeights<Value extends string>(
  selection: AppearanceSelection<Value>,
): ReadonlyMap<Value, number> {
  if (selection.mode !== "weighted") return new Map();
  const weights = normalizeWeights(
    selection.options.map(({ weight }) => weight),
  );
  return new Map(
    selection.options.map(({ value }, index) => [
      value,
      requireWeight(weights[index]),
    ]),
  );
}

function requireFirst<Value>(values: readonly Value[], label: string): Value {
  const value = values[0];
  if (value === undefined) {
    throw new Error(`${label} selection is empty`);
  }
  return value;
}

type SelectionEditorProps<Value extends string> = {
  label: string;
  selection: AppearanceSelection<Value>;
  options: readonly AppearanceTreatmentOption<Value>[];
  disabled: boolean;
  onChange(selection: AppearanceSelection<Value>): void;
};

function SelectionEditor<Value extends string>({
  label,
  selection,
  options,
  disabled,
  onChange,
}: SelectionEditorProps<Value>) {
  const values = selectedValues(selection);
  const selected = new Set(values);
  const weights = selectedWeights(selection);

  const setMode = (mode: SelectionMode) => {
    if (mode === "fixed") {
      onChange({ mode, value: requireFirst(values, label) });
      return;
    }
    if (mode === "allowlist") {
      onChange({ mode, values });
      return;
    }
    const nextWeights = normalizeWeights(values.map(() => 1));
    onChange({
      mode,
      options: values.map((value, index) => ({
        value,
        weight: requireWeight(nextWeights[index]),
      })),
    });
  };

  const toggleValue = (value: Value) => {
    if (selected.has(value) && selected.size === 1) return;
    const nextValues = selected.has(value)
      ? values.filter((option) => option !== value)
      : [...values, value];
    if (selection.mode === "weighted") {
      const nextWeights = normalizeWeights(
        nextValues.map((option) =>
          selected.has(option) ? requireWeight(weights.get(option)) : 1,
        ),
      );
      onChange({
        mode: "weighted",
        options: nextValues.map((option, index) => ({
          value: option,
          weight: requireWeight(nextWeights[index]),
        })),
      });
      return;
    }
    onChange({ mode: "allowlist", values: nextValues });
  };

  const updateWeight = (value: Value, weight: number) => {
    if (selection.mode !== "weighted") return;
    const index = selection.options.findIndex((option) => option.value === value);
    if (index < 0) throw new Error(`${label} weighted option is missing`);
    const nextWeights = updateWeightShare(
      selection.options.map((option) =>
        requireWeight(weights.get(option.value)),
      ),
      index,
      weight,
    );
    onChange({
      mode: "weighted",
      options: selection.options.map((option, optionIndex) => ({
        ...option,
        weight: requireWeight(nextWeights[optionIndex]),
      })),
    });
  };

  return (
    <fieldset className="space-y-3 rounded-md border bg-background p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">Behavior</span>
        <select
          aria-label={`${label} behavior`}
          value={selection.mode}
          disabled={disabled}
          onChange={(event) => setMode(event.target.value as SelectionMode)}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
        >
          <option value="fixed">Fixed</option>
          <option value="allowlist">Allowlist</option>
          <option value="weighted">Weighted</option>
        </select>
      </label>

      {selection.mode !== "fixed" && (
        <div className="space-y-2">
          {options.map(([value, optionLabel]) => {
            const checked = selected.has(value);
            return (
              <div
                key={value}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5"
              >
                <label className="flex min-h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || (checked && selected.size === 1)}
                    onChange={() => toggleValue(value)}
                  />
                  {optionLabel}
                </label>
                {selection.mode === "weighted" && checked && (
                  <label className="min-w-32 flex-1 space-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center justify-between gap-2">
                      <span>{optionLabel} share</span>
                      <span aria-hidden="true">
                        {formatWeightPercent(requireWeight(weights.get(value)))}
                      </span>
                    </span>
                    <input
                      aria-label={`${optionLabel} share`}
                      aria-valuetext={formatWeightPercent(
                        requireWeight(weights.get(value)),
                      )}
                      type="range"
                      min={1}
                      max={MAX_WEIGHT - (values.length - 1)}
                      step={1}
                      value={requireWeight(weights.get(value))}
                      disabled={disabled}
                      onChange={(event) =>
                        updateWeight(value, event.currentTarget.valueAsNumber)
                      }
                      className="h-11 w-full accent-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60 sm:h-8"
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

type AppearanceProceduralControlsProps = {
  recipe: AppearanceRecipeV2;
  onChange(recipe: AppearanceRecipeV2): void;
};

export function AppearanceProceduralControls({
  recipe,
  onChange,
}: AppearanceProceduralControlsProps) {
  const disabled = recipe.compatibility === "legacy-v1";
  return (
    <section aria-label="Procedural material and lighting" className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Material and lighting mixes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every mix keeps at least one option. Adjusting one share balances the
          others automatically.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectionEditor
          label="Gradient scope"
          selection={recipe.gradient.scope}
          options={GRADIENT_SCOPES}
          disabled={disabled}
          onChange={(scope) =>
            onChange({
              ...recipe,
              gradient: { ...recipe.gradient, scope },
            })
          }
        />
        <SelectionEditor
          label="Gradient direction"
          selection={recipe.gradient.direction}
          options={GRADIENT_DIRECTIONS}
          disabled={disabled}
          onChange={(direction) =>
            onChange({
              ...recipe,
              gradient: { ...recipe.gradient, direction },
            })
          }
        />
        <SelectionEditor
          label="Lighting mode"
          selection={recipe.lighting.mode}
          options={LIGHTING_MODES}
          disabled={disabled}
          onChange={(mode) =>
            onChange({
              ...recipe,
              lighting: { ...recipe.lighting, mode },
            })
          }
        />
        <SelectionEditor
          label="Lighting intensity"
          selection={recipe.lighting.strength}
          options={LIGHTING_STRENGTHS}
          disabled={disabled}
          onChange={(strength) =>
            onChange({
              ...recipe,
              lighting: { ...recipe.lighting, strength },
            })
          }
        />
        <SelectionEditor
          label="Lighting direction"
          selection={recipe.lighting.direction}
          options={LIGHTING_DIRECTIONS}
          disabled={disabled}
          onChange={(direction) =>
            onChange({
              ...recipe,
              lighting: { ...recipe.lighting, direction },
            })
          }
        />
      </div>
    </section>
  );
}
