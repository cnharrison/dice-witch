import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  APPEARANCE_TARGET_LABELS,
} from "@/types/appearance";
import {
  APPEARANCE_TARGETS_V4,
  type AppearanceTargetV4,
  type DiceViewAzimuthV4,
  type DiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
import { Info } from "lucide-react";

type DiceViewPreferencesV4Props = {
  value: DiceViewPreferencesV4;
  disabled?: boolean;
  onChange(value: DiceViewPreferencesV4): void;
  onPreviewTargetChange?(target: AppearanceTargetV4 | "all"): void;
};

function ModeDescriptionTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function azimuthLabel(value: number): string {
  if (value === 0) return "0°";
  return `${value > 0 ? "+" : ""}${String(value)}°`;
}

function updateOverride(
  value: DiceViewPreferencesV4,
  target: AppearanceTargetV4,
  mode: "inherit" | DiceViewAzimuthV4["mode"],
): DiceViewPreferencesV4 {
  const overrides = { ...value.azimuth.overrides };
  if (mode === "inherit") {
    delete overrides[target];
  } else {
    const existing = overrides[target];
    overrides[target] = {
      mode,
      customDegrees: existing?.customDegrees ?? 0,
    };
  }
  return {
    ...value,
    azimuth: { ...value.azimuth, overrides },
  };
}

export function DiceViewPreferencesV4({
  value,
  disabled = false,
  onChange,
  onPreviewTargetChange,
}: DiceViewPreferencesV4Props) {
  const overrideActive = value.mode !== "normal";

  const setMode = (mode: "legacy" | "clear", enabled: boolean) => {
    onChange({ ...value, mode: enabled ? mode : "normal" });
    onPreviewTargetChange?.("all");
  };

  const setAllMode = (mode: DiceViewAzimuthV4["mode"]) => {
    onChange({
      ...value,
      azimuth: {
        all: { ...value.azimuth.all, mode },
        overrides: {},
      },
    });
    onPreviewTargetChange?.("all");
  };

  const resetToRandom = () => {
    onChange({
      ...value,
      azimuth: {
        all: { ...value.azimuth.all, mode: "random" },
        overrides: Object.fromEntries(
          Object.entries(value.azimuth.overrides).map(([target, setting]) => [
            target,
            { ...setting, mode: "random" },
          ]),
        ),
      },
    });
    onPreviewTargetChange?.("all");
  };

  return (
    <TooltipProvider delayDuration={0}>
      <section className="space-y-5 rounded-lg border bg-muted/20 p-4" aria-label="Dice view">
        <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
          <Switch
            id="legacy-dice-view"
            checked={value.mode === "legacy"}
            disabled={disabled}
            onCheckedChange={(checked) => setMode("legacy", checked)}
          />
          <div className="flex items-center gap-1.5">
            <Label htmlFor="legacy-dice-view">Use legacy dice view</Label>
            <ModeDescriptionTooltip
              label="About legacy dice view"
              description="Points each rolled result toward you in a fixed 3D composition."
            />
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
          <Switch
            id="clear-dice-view"
            checked={value.mode === "clear"}
            disabled={disabled}
            onCheckedChange={(checked) => setMode("clear", checked)}
          />
          <div className="flex items-center gap-1.5">
            <Label htmlFor="clear-dice-view">Keep rolled results clear</Label>
            <ModeDescriptionTooltip
              label="About clear dice view"
              description="Uses a fixed physically resting view with the result upright."
            />
          </div>
        </div>
      </div>

      {overrideActive && (
        <p className="rounded-lg border border-info-border bg-info p-3 text-sm text-info-foreground">
          The selected readability view temporarily overrides elevation and
          azimuth. Your normal camera settings remain saved below.
        </p>
      )}

      <fieldset disabled={disabled || overrideActive} className="space-y-5 disabled:opacity-60">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="dice-view-elevation">Shared elevation</Label>
            <span className="font-mono text-sm" aria-live="polite">
              {value.elevationDegrees}°
            </span>
          </div>
          <input
            id="dice-view-elevation"
            type="range"
            min={30}
            max={55}
            step={1}
            value={value.elevationDegrees}
            onChange={(event) => {
              onChange({ ...value, elevationDegrees: Number(event.target.value) });
            }}
            className="mt-3 w-full accent-brand"
          />
          <Button
            type="button"
            variant="ghost"
            className="mt-2 px-0"
            onClick={() => {
              onChange({ ...value, elevationDegrees: 40 });
            }}
          >
            Reset to 40°
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Viewing side</h3>
            <Button type="button" variant="outline" onClick={resetToRandom}>
              Reset all to random
            </Button>
          </div>

          <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[8rem_8rem_1fr_3.5rem] sm:items-center">
            <span className="font-semibold">All dice</span>
            <select
              aria-label="All dice viewing side"
              value={value.azimuth.all.mode}
              onChange={(event) =>
                setAllMode(event.target.value as DiceViewAzimuthV4["mode"])
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="random">Random</option>
              <option value="custom">Custom</option>
            </select>
            <input
              aria-label="All dice custom azimuth"
              type="range"
              min={-45}
              max={45}
              step={5}
              disabled={value.azimuth.all.mode !== "custom"}
              value={value.azimuth.all.customDegrees}
              onChange={(event) => {
                onChange({
                  ...value,
                  azimuth: {
                    ...value.azimuth,
                    all: {
                      ...value.azimuth.all,
                      customDegrees: Number(event.target.value),
                    },
                  },
                });
                onPreviewTargetChange?.("all");
              }}
              className="w-full accent-brand"
            />
            <span className="text-right font-mono text-sm">
              {azimuthLabel(value.azimuth.all.customDegrees)}
            </span>
          </div>

          <div className="divide-y rounded-lg border bg-background">
            {APPEARANCE_TARGETS_V4.map((target) => {
              const override = value.azimuth.overrides[target];
              return (
                <div
                  key={target}
                  className="grid gap-3 p-3 sm:grid-cols-[8rem_8rem_1fr_3.5rem] sm:items-center"
                  onFocus={() => onPreviewTargetChange?.(target)}
                >
                  <span className="font-medium">
                    {target === "percentile"
                      ? "Percentile / d100"
                      : APPEARANCE_TARGET_LABELS[target]}
                  </span>
                  <select
                    aria-label={`${APPEARANCE_TARGET_LABELS[target]} viewing side`}
                    value={override?.mode ?? "inherit"}
                    onChange={(event) => {
                      onChange(
                        updateOverride(
                          value,
                          target,
                          event.target.value as
                            | "inherit"
                            | DiceViewAzimuthV4["mode"],
                        ),
                      );
                      onPreviewTargetChange?.(target);
                    }}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="inherit">Use All dice</option>
                    <option value="random">Random</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input
                    aria-label={`${APPEARANCE_TARGET_LABELS[target]} custom azimuth`}
                    type="range"
                    min={-45}
                    max={45}
                    step={5}
                    disabled={override?.mode !== "custom"}
                    value={override?.customDegrees ?? 0}
                    onChange={(event) => {
                      const next = updateOverride(value, target, "custom");
                      const setting = next.azimuth.overrides[target];
                      if (setting === undefined) return;
                      setting.customDegrees = Number(event.target.value);
                      onChange(next);
                      onPreviewTargetChange?.(target);
                    }}
                    className="w-full accent-brand"
                  />
                  <span className="text-right font-mono text-sm">
                    {azimuthLabel(override?.customDegrees ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        </fieldset>
      </section>
    </TooltipProvider>
  );
}
