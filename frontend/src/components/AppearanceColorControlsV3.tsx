import { Button } from "@/components/ui/button";
import { CustomColorPickerDialog } from "@/components/CustomColorPickerDialog";
import { createVividAppearancePaletteV3 } from "@/lib/appearance-editor-v3";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import type { AppearanceColorsV3 } from "@dice-witch/dice-v4-model";
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
  const [pickerTarget, setPickerTarget] = React.useState<number | "add" | null>(
    null,
  );
  const colorButtons = React.useRef<Array<HTMLButtonElement | null>>([]);
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
    colorButtons.current[pendingFocusIndex.current]?.focus();
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

  const updateColor = (index: number, color: string) => {
    if (!HEX_COLOR.test(color)) {
      setError("Colors must use six-digit hexadecimal notation.");
      return;
    }
    if (palette === null) {
      if (colors.mode !== "tonal" && colors.mode !== "random") return;
      emit({ ...colors, primary: color.toLowerCase() });
      return;
    }
    const next = [...palette];
    next[index] = color.toLowerCase();
    if (new Set(next).size < catalog.bounds.paletteColors.minimum) {
      setError("Palette needs at least two distinct colors.");
      return;
    }
    emit({ mode: "palette", colors: next });
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

  let pickerValue = catalog.editorDefaults.primaryColor;
  if (typeof pickerTarget === "number") {
    const selectedColor = editableColors[pickerTarget];
    if (selectedColor === undefined) {
      throw new Error("Selected appearance color is missing");
    }
    pickerValue = selectedColor;
  }

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
              <Button
                ref={(button) => {
                  colorButtons.current[index] = button;
                }}
                type="button"
                variant="ghost"
                value={color}
                className="h-11 gap-2 rounded-r-none px-2 sm:h-8"
                aria-label={`Choose color ${index + 1}`}
                onClick={() => setPickerTarget(index)}
              >
                <span
                  className="h-6 w-8 rounded-sm border sm:h-5"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs uppercase">{color}</span>
              </Button>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                onClick={() => setPickerTarget("add")}
              >
                <Plus aria-hidden="true" />
                Add color
              </Button>
            )}
        </div>
      </div>
      <CustomColorPickerDialog
        open={pickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPickerTarget(null);
        }}
        value={pickerValue}
        selectedColor={typeof pickerTarget === "number" ? pickerValue : null}
        onChange={(color) => {
          if (pickerTarget === "add") addColor(color);
          else if (typeof pickerTarget === "number") {
            updateColor(pickerTarget, color);
          }
        }}
        title="Appearance color"
        description="Choose a color for this appearance using hue, saturation, lightness, or a hexadecimal value."
        visuallyHideHeader
      />
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
