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

const LONG_PRESS_MS = 500;

function targetName(target: AppearanceEditorTargetV3): string {
  return target === "all" ? "All dice" : APPEARANCE_TARGET_LABELS[target];
}

type TargetChipAction = "edit" | "discard";

type AppearanceTargetPickerV3Props = {
  value: AppearanceEditorTargetV3;
  disabled?: boolean;
  onChange(value: AppearanceEditorTargetV3): void;
  // Targets carrying their own assignment override show a dot and expose
  // edit/discard actions.
  overrideTargets?: readonly AppearanceTargetV4[];
  onEditOverride?(target: AppearanceTargetV4): void;
  onDiscardOverride?(target: AppearanceTargetV4): void;
};

export function AppearanceTargetPickerV3({
  value,
  disabled = false,
  onChange,
  overrideTargets,
  onEditOverride,
  onDiscardOverride,
}: AppearanceTargetPickerV3Props) {
  const [menuTarget, setMenuTarget] =
    React.useState<AppearanceTargetV4 | null>(null);
  const buttonRefs = React.useRef<
    Partial<Record<AppearanceEditorTargetV3, HTMLButtonElement | null>>
  >({});
  const pressTimerRef = React.useRef<number | null>(null);
  const overrides = React.useMemo(
    () => new Set(overrideTargets ?? []),
    [overrideTargets],
  );

  const closeMenu = React.useCallback(() => setMenuTarget(null), []);

  React.useEffect(() => {
    if (menuTarget === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"]')
      ) {
        return;
      }
      closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeMenu, menuTarget]);

  React.useEffect(
    () => () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
    },
    [],
  );

  const runChipAction = (target: AppearanceTargetV4, action: TargetChipAction) => {
    setMenuTarget(null);
    if (action === "edit") onEditOverride?.(target);
    else onDiscardOverride?.(target);
  };

  const moveSelection = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    target: AppearanceEditorTargetV3,
  ) => {
    if (
      event.key === "Delete" &&
      target !== "all" &&
      overrides.has(target) &&
      onDiscardOverride !== undefined
    ) {
      event.preventDefault();
      onDiscardOverride(target);
      return;
    }
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
          // Editing ALL only covers dice without their own design, so chips
          // carrying an override stay unhighlighted.
          const highlighted =
            checked ||
            (value === "all" &&
              (target === "all" || !overrides.has(target)));
          const name = targetName(target);
          const hasOverride =
            target !== "all" &&
            overrides.has(target) &&
            (onEditOverride !== undefined ||
              onDiscardOverride !== undefined);
          // SAFETY: The surrounding validation establishes the AppearanceTargetV4 invariant used below.
          return (
            <div key={target} className="relative">
              {hasOverride && (
                <span
                  id={`${target}-own-design-hint`}
                  className="sr-only"
                >
                  Has its own design
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    ref={(element) => {
                      buttonRefs.current[target] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-label={name}
                    aria-checked={checked}
                    aria-describedby={
                      hasOverride ? `${target}-own-design-hint` : undefined
                    }
                    data-highlighted={highlighted}
                    tabIndex={checked ? 0 : -1}
                    disabled={disabled}
                    onClick={() => onChange(target)}
                    onKeyDown={(event) => moveSelection(event, target)}
                    onContextMenu={
                      disabled || !hasOverride
                        ? undefined
                        : (event) => {
                            event.preventDefault();
                            setMenuTarget(target);
                          }
                    }
                    onPointerDown={
                      disabled || !hasOverride
                        ? undefined
                        : (event) => {
                            if (event.pointerType === "mouse") return;
                            pressTimerRef.current = window.setTimeout(() => {
                              setMenuTarget(target);
                            }, LONG_PRESS_MS);
                          }
                    }
                    onPointerUp={
                      disabled || !hasOverride
                        ? undefined
                        : () => {
                            if (pressTimerRef.current !== null) {
                              window.clearTimeout(pressTimerRef.current);
                              pressTimerRef.current = null;
                            }
                          }
                    }
                    onPointerLeave={
                      disabled || !hasOverride
                        ? undefined
                        : () => {
                            if (pressTimerRef.current !== null) {
                              window.clearTimeout(pressTimerRef.current);
                              pressTimerRef.current = null;
                            }
                          }
                    }
                    className={`relative grid aspect-square w-full min-w-0 place-items-center rounded-md border bg-background p-2 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:p-2.5 ${
                      highlighted
                        ? "border-2 border-brand bg-brand/10 p-[7px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_35%,transparent)] sm:p-[9px]"
                        : "border-border hover:border-brand/60 hover:bg-muted/30"
                    }`}
                  >
                    {target === "all" ? (
                      <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-black leading-none tracking-normal">
                        ALL
                      </span>
                    ) : (
                      <AppearanceTargetIconV3
                        target={target as AppearanceTargetV4}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {checked
                    ? `Editing ${target === "all" ? "all dice" : name}`
                    : name}
                </TooltipContent>
              </Tooltip>
              {hasOverride && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-border bg-brand"
                />
              )}
              {menuTarget === target && (
                <div
                  role="menu"
                  aria-label={`${name} design actions`}
                  className="absolute left-1/2 top-full z-20 mt-1 w-44 -translate-x-1/2 rounded-lg border bg-card p-1 shadow-lg"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closeMenu();
                      buttonRefs.current[target]?.focus();
                    }
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => runChipAction(target, "edit")}
                    className="w-full rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Edit {name}&apos;s design
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => runChipAction(target, "discard")}
                    className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Discard {name}&apos;s design…
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
