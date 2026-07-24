import { Button, buttonVariants } from "@/components/ui/button";
import { createVividAppearancePaletteV3 } from "@/lib/appearance-editor-v3";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import type { AppearanceColorsV3 } from "@dice-witch/dice-v4-model";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import * as React from "react";
import { AppearanceSelectV3 } from "./AppearanceSelectV3";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function editablePrimary(colors: AppearanceColorsV3): string | null {
  if (colors.mode === "palette") return colors.colors[0] ?? null;
  if (colors.mode === "tonal" || colors.mode === "random") {
    return colors.primary;
  }
  return null;
}

export function AppearanceColorControlsV3({
  recipe,
  catalog,
  onChange,
}: {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  onChange(recipe: AppearanceRecipeV3): void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const colorInputs = React.useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusIndex = React.useRef<number | null>(null);
  const colors = recipe.colors;
  const palette = colors.mode === "palette" ? colors.colors : null;
  const editableColors =
    palette ??
    (colors.mode === "tonal" || colors.mode === "random"
      ? [colors.primary]
      : []);

  React.useLayoutEffect(() => {
    if (pendingFocusIndex.current === null) return;
    colorInputs.current[pendingFocusIndex.current]?.focus();
    pendingFocusIndex.current = null;
  }, [editableColors.length]);

  const emit = (next: AppearanceColorsV3) => {
    setError(null);
    onChange({ ...recipe, colors: next });
  };

  const updateMode = (mode: AppearanceColorsV3["mode"]) => {
    if (mode === "random-pair" || mode === "vivid-random-pair") {
      emit({ mode });
      return;
    }
    const primary = editablePrimary(colors) ?? catalog.editorDefaults.primaryColor;
    if (mode === "palette") {
      const next =
        colors.mode === "palette"
          ? [...colors.colors]
          : [
              primary,
              ...catalog.editorDefaults.palette.filter(
                (color) => color !== primary,
              ),
            ].slice(0, catalog.bounds.paletteColors.minimum);
      emit({ mode, colors: next });
      return;
    }
    emit({ mode, primary });
  };

  const updateColor = (index: number, color: string): boolean => {
    if (!HEX_COLOR.test(color)) {
      setError("Colors must use six-digit hexadecimal notation.");
      return false;
    }
    if (palette === null) {
      if (colors.mode !== "tonal" && colors.mode !== "random") return false;
      emit({ ...colors, primary: color.toLowerCase() });
      return true;
    }
    const next = [...palette];
    next[index] = color.toLowerCase();
    if (new Set(next).size < catalog.bounds.paletteColors.minimum) {
      setError("Palette needs at least two distinct colors.");
      return false;
    }
    emit({ mode: "palette", colors: next });
    return true;
  };

  const addColor = (color: string) => {
    if (palette === null) return;
    const next = color.toLowerCase();
    if (!HEX_COLOR.test(next)) {
      setError("Colors must use six-digit hexadecimal notation.");
      return;
    }
    if (palette.includes(next)) {
      setError("That color is already in this palette.");
      return;
    }
    pendingFocusIndex.current = palette.length;
    emit({ mode: "palette", colors: [...palette, next] });
  };

  const removeColor = (index: number) => {
    if (
      palette === null ||
      palette.length <= catalog.bounds.paletteColors.minimum
    ) {
      return;
    }
    pendingFocusIndex.current = Math.min(index, palette.length - 2);
    emit({
      mode: "palette",
      colors: palette.filter((_color, colorIndex) => colorIndex !== index),
    });
  };

  const randomizePalette = () => {
    if (palette === null) return;
    try {
      emit({
        mode: "palette",
        colors: createVividAppearancePaletteV3(palette.length),
      });
    } catch {
      setError("The palette could not be randomized. Try again.");
    }
  };

  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">Colors</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <label className="block space-y-1.5 text-xs font-medium">
          <span className="block">Color behavior</span>
          <AppearanceSelectV3
            aria-label="Color behavior"
            value={colors.mode}
            onChange={(event) =>
              updateMode(event.target.value as AppearanceColorsV3["mode"])
            }
          >
            {catalog.colorModes.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </AppearanceSelectV3>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {editableColors.map((color, index) => (
            <div
              key={index}
              className="flex items-center rounded-md border bg-background"
            >
              <label className="flex items-center gap-2 px-2 py-1">
                <span className="sr-only">Color {index + 1}</span>
                <input
                  ref={(input) => {
                    colorInputs.current[index] = input;
                  }}
                  aria-label={`Color ${index + 1}`}
                  type="color"
                  value={color}
                  onChange={(event) => {
                    if (!updateColor(index, event.target.value)) {
                      event.currentTarget.value = color;
                    }
                  }}
                  className="h-11 w-11 cursor-pointer border-0 bg-transparent sm:h-8 sm:w-10"
                />
                <span className="font-mono text-xs uppercase">{color}</span>
              </label>
              {palette !== null &&
                palette.length > catalog.bounds.paletteColors.minimum && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 rounded-l-none border-l sm:h-8 sm:w-8"
                    aria-label={`Remove color ${index + 1}`}
                    title={`Remove color ${index + 1}`}
                    onClick={() => removeColor(index)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
            </div>
          ))}
          {palette !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={randomizePalette}
            >
              Randomize palette
            </Button>
          )}
          {palette !== null &&
            palette.length < catalog.bounds.paletteColors.maximum && (
              <label
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "relative h-11 cursor-pointer overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:h-9",
                )}
              >
                <Plus aria-hidden="true" />
                Add color
                <input
                  aria-label="Add color"
                  type="color"
                  value={catalog.editorDefaults.primaryColor}
                  onChange={(event) => addColor(event.currentTarget.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            )}
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
