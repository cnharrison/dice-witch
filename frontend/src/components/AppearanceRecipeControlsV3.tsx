import { AppearanceColorControlsV3 } from "@/components/AppearanceColorControlsV3";
import { AppearanceMaterialControlsV3 } from "@/components/AppearanceMaterialControlsV3";
import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { AppearanceTreatmentControlsV3 } from "@/components/AppearanceTreatmentControlsV3";
import {
  selectionValuesV3,
  type AppearanceEditorTargetV3,
} from "@/lib/appearance-editor-v3";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";

function selectionSummary(
  mode: "fixed" | "allowlist" | "weighted",
  count: number,
  fixedName: string,
  noun: string,
): string {
  if (mode === "fixed") return fixedName;
  if (mode === "weighted") return `Weighted mix · ${count} ${noun}`;
  return `${count} ${noun}`;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div
      role="group"
      aria-label={`${label}: ${value}`}
      className="rounded-lg border bg-muted/20 px-3 py-2"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export function AppearanceRecipeControlsV3({
  recipe,
  catalog,
  onChange,
}: {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  target: AppearanceEditorTargetV3;
  onChange(recipe: AppearanceRecipeV3): void;
}) {
  const materials = selectionValuesV3(recipe.material);
  const firstMaterial = materials[0];
  if (firstMaterial === undefined) {
    throw new Error("Appearance recipe selections cannot be empty");
  }
  const material = catalog.materials.find(
    ({ family }) => family === firstMaterial.family,
  );
  if (material === undefined) {
    throw new Error("Appearance recipe catalog metadata is missing");
  }
  const fontValue = recipe.font.mode === "fixed" ? recipe.font.value : "";

  return (
    <div className="space-y-5">
      <AppearanceColorControlsV3
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        <label className="block space-y-1.5 text-xs font-medium">
          <span className="block">Font</span>
          <AppearanceSelectV3
            aria-label="Primary font"
            value={fontValue}
            onChange={(event) => {
              if (event.target.value === "") return;
              onChange({
                ...recipe,
                font: { mode: "fixed", value: event.target.value },
              });
            }}
            className="sm:h-10"
          >
            {recipe.font.mode !== "fixed" && (
              <option value="">Procedural mix</option>
            )}
            {catalog.fonts.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </AppearanceSelectV3>
        </label>
        <SummaryField
          label="Material"
          value={selectionSummary(
            recipe.material.mode,
            materials.length,
            material.name,
            "materials",
          )}
        />
      </div>

      <div className="space-y-6 rounded-lg border bg-muted/20 p-4">
        <AppearanceMaterialControlsV3
          recipe={recipe}
          catalog={catalog}
          onChange={onChange}
        />
        <AppearanceTreatmentControlsV3
          recipe={recipe}
          catalog={catalog}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
