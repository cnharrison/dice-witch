import * as React from "react";
import chroma from "chroma-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const HEX_COLOR = /^#[0-9A-F]{6}$/u;
type HslColor = Readonly<{ hue: number; saturation: number; lightness: number }>;

type DefaultChoice = Readonly<{
  label: string;
  selected: boolean;
  onSelect(): void;
}>;

export function CustomColorPickerDialog({
  open,
  onOpenChange,
  value,
  selectedColor = value,
  onChange,
  title,
  description,
  visuallyHideHeader = false,
  suggestedColors = [],
  defaultChoice,
  renderPreview,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  value: string;
  selectedColor?: string | null;
  onChange(color: string): void;
  title: string;
  description: string;
  visuallyHideHeader?: boolean;
  suggestedColors?: readonly string[];
  defaultChoice?: DefaultChoice;
  renderPreview?(color: string): React.ReactNode;
}>) {
  const [custom, setCustom] = React.useState<HslColor>(() => toHsl(value));
  const [hexInput, setHexInput] = React.useState(value.toUpperCase());
  const customHex = chroma
    .hsl(custom.hue, custom.saturation, custom.lightness)
    .hex()
    .toUpperCase();
  const normalizedHex = hexInput.toUpperCase();
  const validHex = HEX_COLOR.test(normalizedHex);

  React.useEffect(() => {
    setCustom(toHsl(value));
    setHexInput(value.toUpperCase());
  }, [open, value]);

  React.useEffect(() => setHexInput(customHex), [customHex]);

  function updateWheel(event: React.PointerEvent<HTMLButtonElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) / 2;
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    setCustom((current) => ({
      ...current,
      hue: (Math.atan2(y, x) * 180 / Math.PI + 450) % 360,
      saturation: Math.min(1, Math.hypot(x, y) / radius),
    }));
  }

  function moveWheel(event: React.KeyboardEvent<HTMLButtonElement>): void {
    let hueDelta = 0;
    let saturationDelta = 0;
    if (event.key === "ArrowLeft") hueDelta = -5;
    else if (event.key === "ArrowRight") hueDelta = 5;
    else if (event.key === "ArrowDown") saturationDelta = -0.05;
    else if (event.key === "ArrowUp") saturationDelta = 0.05;
    else return;
    event.preventDefault();
    setCustom((current) => ({
      ...current,
      hue: (current.hue + hueDelta + 360) % 360,
      saturation: Math.max(
        0,
        Math.min(1, current.saturation + saturationDelta),
      ),
    }));
  }

  const wheelAngle = (custom.hue - 90) * Math.PI / 180;
  const wheelMarker = {
    left: `${50 + Math.cos(wheelAngle) * custom.saturation * 50}%`,
    top: `${50 + Math.sin(wheelAngle) * custom.saturation * 50}%`,
    backgroundColor: customHex,
  };
  const showSuggestions =
    defaultChoice !== undefined || suggestedColors.length > 0;
  const selectedColorValue = selectedColor?.toUpperCase();

  const select = (color: string) => {
    onChange(color.toUpperCase());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className={visuallyHideHeader ? "sr-only" : undefined}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {showSuggestions && (
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Suggested colors"
            >
              {defaultChoice !== undefined && (
                <button
                  type="button"
                  className={cn(
                    "min-h-12 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    defaultChoice.selected && "ring-2 ring-ring",
                  )}
                  aria-pressed={defaultChoice.selected}
                  onClick={() => {
                    defaultChoice.onSelect();
                    onOpenChange(false);
                  }}
                >
                  {defaultChoice.label}
                </button>
              )}
              {suggestedColors.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={cn(
                    "grid min-h-12 place-items-center rounded-md border p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedColorValue === suggestion.toUpperCase() &&
                      "ring-2 ring-ring",
                  )}
                  aria-label={`Use ${suggestion}`}
                  aria-pressed={
                    selectedColorValue === suggestion.toUpperCase()
                  }
                  onClick={() => onChange(suggestion.toUpperCase())}
                >
                  <span
                    className="h-7 w-full rounded-sm border"
                    style={{ backgroundColor: suggestion }}
                  />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="relative mx-auto h-48 w-48 touch-none rounded-full border-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background:
                "radial-gradient(circle, #808080 0%, rgb(128 128 128 / 65%) 18%, transparent 70%), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
            aria-label="Choose hue and saturation"
            aria-valuetext={`Hue ${Math.round(custom.hue)} degrees, saturation ${Math.round(custom.saturation * 100)} percent`}
            onKeyDown={moveWheel}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateWheel(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateWheel(event);
              }
            }}
          >
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-[0_0_0_2px_#181818]"
              style={wheelMarker}
              aria-hidden="true"
            />
          </button>

          <Label className="grid gap-2">
            Lightness
            <input
              type="range"
              min="20"
              max="80"
              value={Math.round(custom.lightness * 100)}
              onChange={(event) =>
                setCustom((current) => ({
                  ...current,
                  lightness: Number(event.target.value) / 100,
                }))
              }
            />
          </Label>
          <Label className="grid gap-2">
            Hex color
            <Input
              value={hexInput}
              maxLength={7}
              pattern="#[0-9A-Fa-f]{6}"
              spellCheck={false}
              aria-invalid={!validHex}
              onChange={(event) => {
                const next = event.target.value.toUpperCase();
                setHexInput(next);
                if (HEX_COLOR.test(next)) setCustom(toHsl(next));
              }}
            />
          </Label>
          {validHex && renderPreview?.(normalizedHex)}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!validHex}
            onClick={() => select(normalizedHex)}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toHsl(color: string): HslColor {
  const [hue, saturation, lightness] = chroma(color).hsl();
  return {
    hue: Number.isFinite(hue) ? hue : 0,
    saturation,
    lightness,
  };
}
