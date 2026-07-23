import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { distinctRandomColor } from "@/lib/appearance-editor";
import type { AppearanceRecipeV2 } from "@/types/appearance";
import { CircleHelp } from "lucide-react";

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const COLOR_MODE_LABELS = {
  tonal: "Tonal",
  random: "Random",
  "random-pair": "Random",
  "vivid-random-pair": "Random",
  palette: "Palette",
} as const;
const COLOR_MODE_DESCRIPTIONS = {
  tonal: "Uses the selected color with a generated lighter or darker companion.",
  random: "Uses the selected color with a deterministic random companion.",
  "random-pair": "Generates two deterministic random colors at the selected scope.",
  "vivid-random-pair":
    "Generates two vivid deterministic colors with accessible numeral contrast.",
  palette: "Uses the ordered colors as gradient stops or pattern colors.",
} as const;

type AppearanceColorMode = AppearanceRecipeV2["colors"]["mode"];

function isGeneratedPairMode(
  mode: AppearanceColorMode,
): mode is "random-pair" | "vivid-random-pair" {
  return mode === "random-pair" || mode === "vivid-random-pair";
}

function randomOptionValue(mode: AppearanceColorMode): AppearanceColorMode {
  if (mode === "random") return mode;
  if (mode === "random-pair") return mode;
  return "vivid-random-pair";
}

type AppearanceColorControlsProps = {
  recipe: AppearanceRecipeV2;
  onChange(recipe: AppearanceRecipeV2): void;
};

export function AppearanceColorControls({
  recipe,
  onChange,
}: AppearanceColorControlsProps) {
  const updateMode = (mode: AppearanceColorMode) => {
    if (isGeneratedPairMode(mode)) {
      onChange({ ...recipe, colors: { mode } });
      return;
    }
    let primary: string | undefined;
    if (recipe.colors.mode === "palette") {
      primary = recipe.colors.colors[0];
    } else if (isGeneratedPairMode(recipe.colors.mode)) {
      primary = distinctRandomColor([]);
    } else {
      primary = recipe.colors.primary;
    }
    if (primary === undefined) {
      throw new Error("Appearance primary color is missing");
    }
    if (mode === "palette") {
      onChange({
        ...recipe,
        colors: {
          mode,
          colors: [primary, distinctRandomColor([primary])],
        },
      });
      return;
    }
    onChange({ ...recipe, colors: { mode, primary } });
  };

  const updateColor = (index: number, color: string) => {
    if (!HEX_COLOR.test(color)) return;
    if (isGeneratedPairMode(recipe.colors.mode)) {
      throw new Error("Random appearance colors cannot be edited directly");
    }
    if (recipe.colors.mode !== "palette") {
      onChange({ ...recipe, colors: { ...recipe.colors, primary: color } });
      return;
    }
    const colors = [...recipe.colors.colors];
    colors[index] = color;
    if (new Set(colors).size < 2) return;
    onChange({ ...recipe, colors: { mode: "palette", colors } });
  };

  const paletteColors =
    recipe.colors.mode === "palette" ? recipe.colors.colors : null;
  const colors =
    paletteColors ??
    (isGeneratedPairMode(recipe.colors.mode) ? [] : [recipe.colors.primary]);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Colors</legend>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex items-center gap-1">
          <select
            aria-label="Color behavior"
            value={recipe.colors.mode}
            onChange={(event) =>
              updateMode(event.target.value as AppearanceColorMode)
            }
            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          >
            <option value="tonal">Tonal</option>
            <option value={randomOptionValue(recipe.colors.mode)}>
              Random
            </option>
            <option value="palette">Palette</option>
          </select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Explain ${COLOR_MODE_LABELS[recipe.colors.mode]} colors`}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CircleHelp aria-hidden="true" className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {COLOR_MODE_DESCRIPTIONS[recipe.colors.mode]}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((color, index) => (
            <label
              key={index}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1"
            >
              <span className="sr-only">Color {index + 1}</span>
              <input
                type="color"
                value={color}
                onChange={(event) => updateColor(index, event.target.value)}
                className="h-8 w-10 cursor-pointer border-0 bg-transparent"
              />
              <span className="font-mono text-xs uppercase">{color}</span>
            </label>
          ))}
          {paletteColors !== null && paletteColors.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...recipe,
                    colors: {
                      mode: "palette",
                      colors: [
                        ...paletteColors,
                        distinctRandomColor(paletteColors),
                      ],
                    },
                  })
                }
              >
                Add color
              </Button>
            )}
          {paletteColors !== null && paletteColors.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...recipe,
                    colors: {
                      mode: "palette",
                      colors: paletteColors.slice(0, -1),
                    },
                  })
                }
              >
                Remove
              </Button>
            )}
        </div>
      </div>
    </fieldset>
  );
}
