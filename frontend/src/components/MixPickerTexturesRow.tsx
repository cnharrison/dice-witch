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
            <div
              key={material.family}
              data-state={expanded ? "open" : "closed"}
              className={`overflow-hidden rounded-lg border transition-colors ${
                expanded
                  ? "border-brand/40 bg-secondary/50 shadow-sm"
                  : "border-border bg-muted/40 hover:bg-muted/60"
              }`}
            >
              <button
                type="button"
                aria-expanded={expanded}
                disabled={disabled}
                onClick={() => setOpenFamily(expanded ? null : material.family)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                  expanded
                    ? "bg-muted/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {name}
              </button>
              {expanded && (
                <div className="grid gap-3 border-t border-border bg-background/70 p-3 sm:grid-cols-2">
                  <AppearanceMaterialOptionV3
                    material={material}
                    catalog={catalog}
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
