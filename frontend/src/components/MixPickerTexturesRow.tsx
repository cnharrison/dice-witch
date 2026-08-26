import { AppearanceMaterialOptionV3 } from "@/components/AppearanceMaterialOptionV3";
import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import { replaceMaterialFamily } from "@/lib/mix-picker-state";
import type {
  AppearanceCatalogV3,
  AppearanceMaterial,
  AppearanceRecipeV3,
} from "@/types/appearance";
import * as React from "react";

type MixPickerTexturesRowProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  disabled?: boolean;
  onChange(recipe: AppearanceRecipeV3): void;
};

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

export function MixPickerTexturesRow({
  recipe,
  catalog,
  disabled = false,
  onChange,
}: MixPickerTexturesRowProps) {
  const materials = React.useMemo(
    () => [
      ...new Map(
        selectionValuesV3(recipe.material).map((material) => [
          material.family,
          material,
        ]),
      ).values(),
    ],
    [recipe.material],
  );
  const firstFamily = materials[0]?.family;
  if (firstFamily === undefined) {
    throw new Error("Texture controls require a selected material");
  }
  const [openFamily, setOpenFamily] = React.useState<string | null>(firstFamily);

  React.useEffect(() => {
    if (!materials.some(({ family }) => family === openFamily)) {
      setOpenFamily(firstFamily);
    }
  }, [firstFamily, materials, openFamily]);

  const repeatedGradient = supportsRepeatedGradient(recipe);
  return (
    <section aria-label="Textures">
      <h3 className="text-xs font-semibold uppercase tracking-wide">
        Textures
      </h3>
      <div className="mt-2 space-y-2">
        {materials.map((material) => {
          const name =
            catalog.materials.find(({ family }) => family === material.family)
              ?.name ?? material.family;
          const expanded = openFamily === material.family;
          return (
            <div key={material.family} className="rounded-lg border">
              <button
                type="button"
                aria-expanded={expanded}
                disabled={disabled}
                onClick={() => setOpenFamily(expanded ? null : material.family)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {name}
              </button>
              {expanded && (
                <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                  <AppearanceMaterialOptionV3
                    material={material}
                    catalog={catalog}
                    repeatedGradient={repeatedGradient}
                    disabled={disabled}
                    onChange={(next: AppearanceMaterial) =>
                      onChange({
                        ...recipe,
                        material: replaceMaterialFamily(
                          recipe.material,
                          material.family,
                          next,
                        ),
                      })
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
