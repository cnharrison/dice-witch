import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { AppearanceStringSelectionV3 } from "@/components/AppearanceStringSelectionV3";
import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import {
  parseAppearanceRecipeV3,
  type AppearanceRecipeV3,
  type AppearanceSelection,
} from "@dice-witch/dice-v4-model";
import * as React from "react";

type Option<Value extends string> = Readonly<{ id: Value; name: string }>;

function PrimarySelection<Value extends string>({
  label,
  selection,
  options,
  onChange,
}: {
  label: string;
  selection: AppearanceSelection<Value>;
  options: readonly Option<Value>[];
  onChange(selection: AppearanceSelection<Value>): void;
}) {
  const value = selection.mode === "fixed" ? selection.value : "procedural";
  return (
    <label className="block space-y-1.5 text-xs font-medium">
      <span className="block">{label}</span>
      <AppearanceSelectV3
        aria-label={label}
        value={value}
        onChange={(event) => {
          if (event.target.value !== "procedural") {
            onChange({ mode: "fixed", value: event.target.value as Value });
          }
        }}
      >
        {selection.mode !== "fixed" && (
          <option value="procedural">Procedural mix</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </AppearanceSelectV3>
    </label>
  );
}

function supportsRepeatedGradient(recipe: AppearanceRecipeV3): boolean {
  return (
    selectionValuesV3(recipe.material).every(
      (material) =>
        material.family === "classic" && material.treatment === "gradient",
    ) &&
    selectionValuesV3(recipe.form.polyhedral).every(
      (form) => form === "standard",
    )
  );
}

export function AppearanceTreatmentControlsV3({
  recipe,
  catalog,
  onChange,
}: {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  onChange(recipe: AppearanceRecipeV3): void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const lightingModes = selectionValuesV3(recipe.lighting.mode);
  const showLightingStrength = lightingModes.some((mode) => mode !== "none");
  const showLightingDirection = lightingModes.some(
    (mode) => mode === "directional" || mode === "combined",
  );
  const repeatedSupported = supportsRepeatedGradient(recipe);
  const selectedGradientScopes = new Set(
    selectionValuesV3(recipe.gradient.scope),
  );
  const gradientScopeOptions = catalog.gradient.scopes.filter(
    ({ id }) =>
      id !== "repeated" || repeatedSupported || selectedGradientScopes.has(id),
  );

  const emit = (next: AppearanceRecipeV3) => {
    try {
      setError(null);
      onChange(parseAppearanceRecipeV3(next));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Appearance treatment is invalid",
      );
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="treatment-controls-heading">
      <h2 id="treatment-controls-heading" className="text-sm font-semibold">
        Type &amp; light
      </h2>

      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
        role="group"
        aria-label="Primary appearance treatment"
      >
        <label className="block space-y-1.5 text-xs font-medium">
          <span className="block">Variation</span>
          <AppearanceSelectV3
            aria-label="Variation"
            value={recipe.variation}
            onChange={(event) =>
              emit({
                ...recipe,
                variation: event.target.value as AppearanceRecipeV3["variation"],
              })
            }
          >
            {catalog.variations.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </AppearanceSelectV3>
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          <span className="block">Change appearance</span>
          <AppearanceSelectV3
            aria-label="Change appearance"
            value={recipe.varyBy}
            onChange={(event) =>
              emit({
                ...recipe,
                varyBy: event.target.value as AppearanceRecipeV3["varyBy"],
              })
            }
          >
            {catalog.variationScopes.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </AppearanceSelectV3>
        </label>
        <PrimarySelection
          label="Font"
          selection={recipe.font}
          options={catalog.fonts}
          onChange={(font) => emit({ ...recipe, font })}
        />
        <PrimarySelection
          label="Gradient scope"
          selection={recipe.gradient.scope}
          options={gradientScopeOptions}
          onChange={(scope) =>
            emit({
              ...recipe,
              gradient: { ...recipe.gradient, scope },
            })
          }
        />
        <PrimarySelection
          label="Gradient direction"
          selection={recipe.gradient.direction}
          options={catalog.gradient.directions}
          onChange={(direction) =>
            emit({
              ...recipe,
              gradient: { ...recipe.gradient, direction },
            })
          }
        />
        <PrimarySelection
          label="Lighting mode"
          selection={recipe.lighting.mode}
          options={catalog.lighting.modes}
          onChange={(mode) =>
            emit({ ...recipe, lighting: { ...recipe.lighting, mode } })
          }
        />
        {showLightingStrength && (
          <PrimarySelection
            label="Lighting intensity"
            selection={recipe.lighting.strength}
            options={catalog.lighting.strengths}
            onChange={(strength) =>
              emit({
                ...recipe,
                lighting: { ...recipe.lighting, strength },
              })
            }
          />
        )}
        {showLightingDirection && (
          <PrimarySelection
            label="Lighting direction"
            selection={recipe.lighting.direction}
            options={catalog.lighting.directions}
            onChange={(direction) =>
              emit({
                ...recipe,
                lighting: { ...recipe.lighting, direction },
              })
            }
          />
        )}
      </div>

      <details className="rounded-lg border bg-muted/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Advanced procedural controls
        </summary>
        <div
          className="mt-4 space-y-4"
          role="group"
          aria-label="Advanced appearance treatment"
        >
          <AppearanceStringSelectionV3
            label="Font"
            selection={recipe.font}
            options={catalog.fonts}
            weightBounds={catalog.bounds.selectionWeight}
            maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
            onChange={(font) => emit({ ...recipe, font })}
          />
          <AppearanceStringSelectionV3
            label="Engraving finish"
            selection={recipe.engraving}
            options={catalog.engravingFinishes}
            weightBounds={catalog.bounds.selectionWeight}
            maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
            onChange={(engraving) => emit({ ...recipe, engraving })}
          />
          <AppearanceStringSelectionV3
            label="Gradient scope"
            selection={recipe.gradient.scope}
            options={gradientScopeOptions}
            weightBounds={catalog.bounds.selectionWeight}
            maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
            onChange={(scope) =>
              emit({
                ...recipe,
                gradient: { ...recipe.gradient, scope },
              })
            }
          />
          <AppearanceStringSelectionV3
            label="Gradient direction"
            selection={recipe.gradient.direction}
            options={catalog.gradient.directions}
            weightBounds={catalog.bounds.selectionWeight}
            maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
            onChange={(direction) =>
              emit({
                ...recipe,
                gradient: { ...recipe.gradient, direction },
              })
            }
          />
          <AppearanceStringSelectionV3
            label="Lighting mode"
            selection={recipe.lighting.mode}
            options={catalog.lighting.modes}
            weightBounds={catalog.bounds.selectionWeight}
            maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
            onChange={(mode) =>
              emit({ ...recipe, lighting: { ...recipe.lighting, mode } })
            }
          />
          {showLightingStrength && (
            <AppearanceStringSelectionV3
              label="Lighting intensity"
              selection={recipe.lighting.strength}
              options={catalog.lighting.strengths}
              weightBounds={catalog.bounds.selectionWeight}
              maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
              onChange={(strength) =>
                emit({
                  ...recipe,
                  lighting: { ...recipe.lighting, strength },
                })
              }
            />
          )}
          {showLightingDirection && (
            <AppearanceStringSelectionV3
              label="Lighting direction"
              selection={recipe.lighting.direction}
              options={catalog.lighting.directions}
              weightBounds={catalog.bounds.selectionWeight}
              maximumTotalWeight={catalog.bounds.maximumTotalSelectionWeight}
              onChange={(direction) =>
                emit({
                  ...recipe,
                  lighting: { ...recipe.lighting, direction },
                })
              }
            />
          )}
        </div>
      </details>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
