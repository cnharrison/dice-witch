import { AppearanceTargetIconV3 } from "@/components/AppearanceTargetIconsV3";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import { APPEARANCE_TARGET_LABELS } from "@/types/appearance";
import {
  APPEARANCE_TARGETS_V4,
  type AppearanceTargetV4,
} from "@dice-witch/dice-v4-model";
import * as React from "react";

const TARGETS: readonly AppearanceEditorTargetV3[] = [
  "all",
  ...APPEARANCE_TARGETS_V4,
];

function targetName(target: AppearanceEditorTargetV3): string {
  return target === "all" ? "All dice" : APPEARANCE_TARGET_LABELS[target];
}

export function AppearanceTargetPickerV3({
  value,
  disabled = false,
  onChange,
}: {
  value: AppearanceEditorTargetV3;
  disabled?: boolean;
  onChange(value: AppearanceEditorTargetV3): void;
}) {
  const buttonRefs = React.useRef<
    Partial<Record<AppearanceEditorTargetV3, HTMLButtonElement | null>>
  >({});

  const moveSelection = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    target: AppearanceEditorTargetV3,
  ) => {
    let nextIndex: number | null = null;
    const index = TARGETS.indexOf(target);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % TARGETS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + TARGETS.length) % TARGETS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TARGETS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTarget = TARGETS[nextIndex];
    if (nextTarget === undefined) return;
    onChange(nextTarget);
    buttonRefs.current[nextTarget]?.focus();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        role="radiogroup"
        aria-label="Appearance target"
        className="grid grid-cols-5 gap-2 sm:grid-cols-10"
      >
        {TARGETS.map((target) => {
          const checked = target === value;
          const highlighted = value === "all" || checked;
          const name = targetName(target);
          return (
            <Tooltip key={target}>
              <TooltipTrigger asChild>
                <button
                  ref={(element) => {
                    buttonRefs.current[target] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-label={name}
                  aria-checked={checked}
                  data-highlighted={highlighted}
                  tabIndex={checked ? 0 : -1}
                  disabled={disabled}
                  onClick={() => onChange(target)}
                  onKeyDown={(event) => moveSelection(event, target)}
                  className={`relative grid aspect-square min-w-0 place-items-center rounded-md border bg-background p-2 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:p-2.5 ${
                    highlighted
                      ? "border-2 border-brand bg-brand/10 p-[7px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_35%,transparent)] sm:p-[9px]"
                      : "border-border hover:border-brand/60 hover:bg-muted/30"
                  }`}
                >
                  {target === "all" ? (
                    <span className="text-sm font-black tracking-[0.12em]">
                      ALL
                    </span>
                  ) : (
                    <AppearanceTargetIconV3
                      target={target as AppearanceTargetV4}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{name}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
