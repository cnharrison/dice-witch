import {
  GRADIENT_DIRECTIONS,
  GRADIENT_SCOPES,
  LIGHTING_DIRECTIONS,
  LIGHTING_MODES,
  LIGHTING_STRENGTHS,
} from "@/components/appearance-treatment-options";
import { Button } from "@/components/ui/button";
import { createNativeAppearanceTreatment } from "@/lib/appearance-editor";
import type {
  AppearanceFill,
  AppearanceGradientScope,
  AppearanceLightingDirection,
  AppearanceLightingMode,
  AppearanceLightingStrength,
  AppearanceLinearDirection,
  AppearanceRecipeV2,
  AppearanceSelection,
} from "@/types/appearance";

function selectedFills(selection: AppearanceRecipeV2["fill"]): AppearanceFill[] {
  if (selection.mode === "fixed") return [selection.value];
  if (selection.mode === "allowlist") return selection.values;
  return selection.options.map(({ value }) => value);
}

function selectedValues<Value>(selection: AppearanceSelection<Value>): Value[] {
  if (selection.mode === "fixed") return [selection.value];
  if (selection.mode === "allowlist") return selection.values;
  return selection.options.map(({ value }) => value);
}

function primaryValue<Value extends string>(
  selection: AppearanceSelection<Value>,
): Value | "procedural" {
  return selection.mode === "fixed" ? selection.value : "procedural";
}

type AppearanceSurfaceControlsProps = {
  recipe: AppearanceRecipeV2;
  onChange(recipe: AppearanceRecipeV2): void;
};

export function AppearanceSurfaceControls({
  recipe,
  onChange,
}: AppearanceSurfaceControlsProps) {
  const isLegacy = recipe.compatibility === "legacy-v1";
  const hasGradient = selectedFills(recipe.fill).some(
    ({ type }) => type === "gradient",
  );
  const lightingModes = selectedValues(recipe.lighting.mode);
  const showStrength = lightingModes.some((mode) => mode !== "none");
  const showDirection = lightingModes.some(
    (mode) => mode === "directional" || mode === "combined",
  );

  return (
    <section
      aria-label="Material and lighting"
      className="space-y-4 rounded-lg border bg-muted/20 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-sm font-semibold">
          {hasGradient ? "Gradient & lighting" : "Lighting"}
        </h2>
        {isLegacy && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({ ...recipe, ...createNativeAppearanceTreatment() })
            }
          >
            Upgrade material and lighting
          </Button>
        )}
      </div>

      {isLegacy && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          This design uses legacy appearance treatment. Its original material
          and lighting stay locked until you explicitly upgrade it.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {hasGradient && (
          <>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Gradient scope</span>
              <select
                aria-label="Gradient scope"
                value={primaryValue(recipe.gradient.scope)}
                disabled={isLegacy}
                onChange={(event) =>
                  onChange({
                    ...recipe,
                    gradient: {
                      ...recipe.gradient,
                      scope: {
                        mode: "fixed",
                        value: event.target.value as AppearanceGradientScope,
                      },
                    },
                  })
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recipe.gradient.scope.mode !== "fixed" && (
                  <option value="procedural">Procedural mix</option>
                )}
                {GRADIENT_SCOPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium">Gradient direction</span>
              <select
                aria-label="Gradient direction"
                value={primaryValue(recipe.gradient.direction)}
                disabled={isLegacy}
                onChange={(event) =>
                  onChange({
                    ...recipe,
                    gradient: {
                      ...recipe.gradient,
                      direction: {
                        mode: "fixed",
                        value: event.target.value as AppearanceLinearDirection,
                      },
                    },
                  })
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recipe.gradient.direction.mode !== "fixed" && (
                  <option value="procedural">Procedural mix</option>
                )}
                {GRADIENT_DIRECTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Lighting mode</span>
          <select
            aria-label="Lighting mode"
            value={primaryValue(recipe.lighting.mode)}
            disabled={isLegacy}
            onChange={(event) => {
              const mode = event.target.value as AppearanceLightingMode;
              const enablingLighting =
                mode !== "none" &&
                lightingModes.every((current) => current === "none");
              onChange({
                ...recipe,
                lighting: {
                  ...recipe.lighting,
                  mode: { mode: "fixed", value: mode },
                  strength: enablingLighting
                    ? { mode: "fixed", value: "gentle" }
                    : recipe.lighting.strength,
                },
              });
            }}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {recipe.lighting.mode.mode !== "fixed" && (
              <option value="procedural">Procedural mix</option>
            )}
            {LIGHTING_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {showStrength && (
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Lighting intensity</span>
            <select
              aria-label="Lighting intensity"
              value={primaryValue(recipe.lighting.strength)}
              disabled={isLegacy}
              onChange={(event) =>
                onChange({
                  ...recipe,
                  lighting: {
                    ...recipe.lighting,
                    strength: {
                      mode: "fixed",
                      value: event.target.value as AppearanceLightingStrength,
                    },
                  },
                })
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recipe.lighting.strength.mode !== "fixed" && (
                <option value="procedural">Procedural mix</option>
              )}
              {LIGHTING_STRENGTHS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        {showDirection && (
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Lighting direction</span>
            <select
              aria-label="Lighting direction"
              value={primaryValue(recipe.lighting.direction)}
              disabled={isLegacy}
              onChange={(event) =>
                onChange({
                  ...recipe,
                  lighting: {
                    ...recipe.lighting,
                    direction: {
                      mode: "fixed",
                      value: event.target.value as AppearanceLightingDirection,
                    },
                  },
                })
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recipe.lighting.direction.mode !== "fixed" && (
                <option value="procedural">Procedural mix</option>
              )}
              {LIGHTING_DIRECTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
