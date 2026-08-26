import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  D4Icon,
  D6Icon,
  D8Icon,
  D10Icon,
  D12Icon,
  D20Icon,
  DFIcon,
} from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { useBrowserMediaQueryV4 } from "./dice-v4-3d/browser-media";

const MOBILE_QUERY = "(max-width: 639px)";
const COMMON_DICE = [4, 6, 8, 10, 12, 20] as const;
const ADVANCED_DICE = [100, "F"] as const;
const OPERATORS = ["+", "-", "*", "/"] as const;
const KEEP_DROP = ["k", "kl", "d", "dh"] as const;
const EXPLODING = ["!", "!!", "!p"] as const;
const COMPARISON = ["=", ">", "<", ">=", "<="] as const;
const REROLL = ["r", "ro"] as const;
const UNIQUE = ["u"] as const;
const SUCCESS_FAILURE = ["cs", "cf"] as const;
const MODIFIERS = [
  ...KEEP_DROP,
  ...EXPLODING,
  ...REROLL,
  ...UNIQUE,
  ...SUCCESS_FAILURE,
  ...COMPARISON,
] as const;
const MODIFIER_DESCRIPTIONS = new Map<string, string>(Object.entries({
  k: "Keeps the highest die result in the group.",
  kl: "Keeps the lowest die result in the group.",
  d: "Drops the lowest die result in the group.",
  dh: "Drops the highest die result in the group.",
  "!": "Rolls another die whenever the maximum value is rolled.",
  "!!": "Adds each exploding roll into one compound result.",
  "!p": "Explodes on the maximum and subtracts one from each extra roll.",
  r: "Rerolls matching results until they no longer match.",
  ro: "Rerolls matching results once.",
  u: "Rerolls duplicate results until every result is unique.",
  cs: "Marks matching results as critical successes.",
  cf: "Marks matching results as critical failures.",
  "=": "Counts results equal to the comparison value as successes.",
  ">": "Counts results above the comparison value as successes.",
  "<": "Counts results below the comparison value as successes.",
  ">=": "Counts results at or above the comparison value as successes.",
  "<=": "Counts results at or below the comparison value as successes.",
}));
const ADVANCED_TABS = ["dice", "modifiers", "numbers"] as const;
type AdvancedTab = (typeof ADVANCED_TABS)[number];
const ADVANCED_TAB_LABELS = {
  dice: "Dice",
  modifiers: "Modifiers",
  numbers: "Numbers",
} satisfies Readonly<Record<AdvancedTab, string>>;
const MODIFIER_SUFFIX =
  "(?:k(?:l)?\\d+|d(?:h)?\\d+|!!|!p|!|ro|r|u|cs=\\d+|cf=\\d+|>=\\d+|<=\\d+|=\\d+|>\\d+|<\\d+)*";

export type QuickDie =
  | (typeof COMMON_DICE)[number]
  | (typeof ADVANCED_DICE)[number];

interface DiceNotationButtonsProps {
  input: string;
  setInput: (value: string) => void;
  isDisabled?: boolean;
}

function dieToken(sides: QuickDie): string {
  return sides === 100 ? "%" : String(sides);
}

function dieLabel(sides: QuickDie): string {
  return `d${dieToken(sides)}`;
}

function escapedDieToken(sides: QuickDie): string {
  return dieToken(sides).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanNotationAfterRemoval(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/^[+\-*/]/, "")
    .replace(/[+\-*/]$/, "");
}

export function incrementDiceNotation(
  currentInput: string,
  sides: QuickDie,
): string {
  const token = dieToken(sides);
  if (currentInput === "") return `1d${token}`;
  const pattern = new RegExp(
    `(^|[+\\-*/])\\s*(\\d+)d${escapedDieToken(sides)}(?![\\d%F])`,
    "gi",
  );
  const matches = [...currentInput.matchAll(pattern)];
  const match = matches.at(-1);
  if (match !== undefined && match.index !== undefined) {
    const operator = match[1] ?? "";
    const count = Number.parseInt(match[2] ?? "", 10);
    const replacement = `${operator}${String(count + 1)}d${token}`;
    return `${currentInput.slice(0, match.index)}${replacement}${currentInput.slice(
      match.index + match[0].length,
    )}`;
  }
  const separator = /[+\-*/]$/.test(currentInput) ? "" : "+";
  return `${currentInput}${separator}1d${token}`;
}

export function decrementDiceNotation(
  currentInput: string,
  sides: QuickDie,
): string {
  const pattern = new RegExp(
    `(^|[+\\-*/])\\s*(\\d+)d${escapedDieToken(sides)}(?![\\d%F])${MODIFIER_SUFFIX}`,
    "gi",
  );
  const matches = [...currentInput.matchAll(pattern)];
  const match = matches.at(-1);
  if (match === undefined || match.index === undefined) return currentInput;
  const count = Number.parseInt(match[2] ?? "", 10);
  if (count > 1) {
    const replacement = match[0].replace(
      new RegExp(`\\d+(?=d${escapedDieToken(sides)})`, "i"),
      String(count - 1),
    );
    return `${currentInput.slice(0, match.index)}${replacement}${currentInput.slice(
      match.index + match[0].length,
    )}`;
  }
  return cleanNotationAfterRemoval(
    `${currentInput.slice(0, match.index)}${currentInput.slice(
      match.index + match[0].length,
    )}`,
  );
}

export function countDiceNotation(
  input: string,
  sides: QuickDie,
): number {
  const pattern = new RegExp(
    `(\\d+)d${escapedDieToken(sides)}(?![\\d%F])`,
    "gi",
  );
  return [...input.matchAll(pattern)].reduce(
    (total, match) => total + Number.parseInt(match[1] ?? "0", 10),
    0,
  );
}

function appendOperator(currentInput: string, operator: string): string {
  if (currentInput === "") return currentInput;
  if (/[+\-*/]$/.test(currentInput)) {
    return `${currentInput.slice(0, -1)}${operator}`;
  }
  return /\d$/.test(currentInput) ? `${currentInput}${operator}` : currentInput;
}

// SAFETY: The surrounding validation establishes the (typeof SUCCESS_FAILURE)[number] and (typeof KEEP_DROP)[number] invariant used below.
function appendModifier(currentInput: string, modifier: string): string {
  if (currentInput === "" || !/\d+d(?:\d+|%|F)/i.test(currentInput)) {
    return currentInput;
  }
  if (SUCCESS_FAILURE.includes(modifier as (typeof SUCCESS_FAILURE)[number])) {
    return `${currentInput}${modifier}=1`;
  }
  if (KEEP_DROP.includes(modifier as (typeof KEEP_DROP)[number])) {
    return `${currentInput}${modifier}1`;
  }
  return `${currentInput}${modifier}`;
}

function modifierLabel(modifier: string): string {
  switch (modifier) {
    case "k": return "Keep highest";
    case "kl": return "Keep lowest";
    case "d": return "Drop lowest";
    case "dh": return "Drop highest";
    case "!": return "Explode";
    case "!!": return "Compound explosion";
    case "!p": return "Penetrating explosion";
    case "r": return "Reroll until no match";
    case "ro": return "Reroll once";
    case "u": return "Unique";
    case "cs": return "Critical success";
    case "cf": return "Critical failure";
    default: return `Comparison ${modifier}`;
  }
}

function modifierDescription(modifier: string): string {
  const description = MODIFIER_DESCRIPTIONS.get(modifier);
  if (description === undefined) throw new Error("Unknown dice modifier");
  return description;
}

function DieIcon({ sides }: { sides: QuickDie }) {
  const { theme } = useTheme();
  const props = { className: "h-5 w-5", darkMode: theme === "dark" };
  if (sides === "F") return <DFIcon {...props} />;
  if (sides === 100) {
    return <span className="flex h-5 w-5 items-center justify-center text-xs font-bold">d%</span>;
  }
  const Icon = {
    4: D4Icon,
    6: D6Icon,
    8: D8Icon,
    10: D10Icon,
    12: D12Icon,
    20: D20Icon,
  }[sides];
  return <Icon {...props} />;
}

function DesktopDieControl({
  sides,
  count,
  disabled,
  onAdd,
  onRemove,
}: {
  sides: QuickDie;
  count: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const label = dieLabel(sides);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`Add ${label}`}
          onClick={onAdd}
          onContextMenu={(event) => {
            event.preventDefault();
            onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "-") {
              event.preventDefault();
              onRemove();
            } else if (event.key === "ArrowUp" || event.key === "+") {
              event.preventDefault();
              onAdd();
            }
          }}
          className="relative h-12 min-w-12 flex-1 flex-col gap-0 p-1"
        >
          <DieIcon sides={sides} />
          <span className="text-[11px]">{label}</span>
          {count > 0 && (
            <span
              data-die-count
              className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground shadow-md"
            >
              {count}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Click to add {label}</p>
        <p className="text-xs text-muted-foreground">
          Right-click, Down Arrow, or Minus to subtract
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function MobileDieControl({
  sides,
  count,
  disabled,
  onAdd,
  onRemove,
}: {
  sides: QuickDie;
  count: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const label = dieLabel(sides);
  return (
    <div className="flex w-full min-w-0 items-center rounded-md border bg-background">
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || count === 0}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="h-11 w-11 shrink-0 rounded-r-none p-0 text-lg"
      >
        −
      </Button>
      <div className="flex h-11 min-w-0 flex-1 flex-col items-center justify-center border-x text-xs">
        <span className="font-semibold">{label}</span>
        <span aria-label={`${String(count)} ${label} selected`}>{count}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        aria-label={`Add ${label}`}
        onClick={onAdd}
        className="h-11 w-11 shrink-0 rounded-l-none p-0 text-lg"
      >
        +
      </Button>
    </div>
  );
}

export function DiceNotationButtons({
  input,
  setInput,
  isDisabled = false,
}: DiceNotationButtonsProps) {
  const mobile = useBrowserMediaQueryV4(MOBILE_QUERY);
  const inputRef = React.useRef(input);
  const advancedId = React.useId();
  const [advancedOpen, setAdvancedOpen] = React.useState(() => !mobile);
  const [advancedTab, setAdvancedTab] = React.useState<AdvancedTab>(() =>
    mobile ? "dice" : "modifiers",
  );

  React.useEffect(() => {
    inputRef.current = input;
  }, [input]);

  React.useEffect(() => {
    if (!mobile || !advancedOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setAdvancedOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [advancedOpen, mobile]);

  const commit = React.useCallback(
    (next: string) => {
      inputRef.current = next;
      setInput(next);
    },
    [setInput],
  );
  const addDie = React.useCallback(
    (sides: QuickDie) => {
      if (!isDisabled) commit(incrementDiceNotation(inputRef.current, sides));
    },
    [commit, isDisabled],
  );
  const removeDie = React.useCallback(
    (sides: QuickDie) => {
      if (!isDisabled) commit(decrementDiceNotation(inputRef.current, sides));
    },
    [commit, isDisabled],
  );
  const addOperator = (operator: string) => {
    if (!isDisabled) commit(appendOperator(inputRef.current, operator));
  };
  const addModifier = (modifier: string) => {
    if (!isDisabled) commit(appendModifier(inputRef.current, modifier));
  };
  const addNumber = (number: number) => {
    if (!isDisabled) commit(`${inputRef.current}${String(number)}`);
  };

  const quickControls = COMMON_DICE.map((sides) => {
    const props = {
      sides,
      count: countDiceNotation(input, sides),
      disabled: isDisabled,
      onAdd: () => addDie(sides),
      onRemove: () => removeDie(sides),
    };
    return mobile ? (
      <MobileDieControl key={String(sides)} {...props} />
    ) : (
      <DesktopDieControl key={String(sides)} {...props} />
    );
  });
  const advancedDiceControls = (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {ADVANCED_DICE.map((sides) => {
          const props = {
            sides,
            count: countDiceNotation(input, sides),
            disabled: isDisabled,
            onAdd: () => addDie(sides),
            onRemove: () => removeDie(sides),
          };
          return mobile ? (
            <MobileDieControl key={String(sides)} {...props} />
          ) : (
            <DesktopDieControl key={String(sides)} {...props} />
          );
        })}
      </div>
      {mobile && (
        <div className="grid grid-cols-4 gap-2" aria-label="Operators">
          {OPERATORS.map((operator) => (
            <Button
              type="button"
              key={operator}
              variant="outline"
              onClick={() => addOperator(operator)}
              disabled={isDisabled}
              className="h-11"
            >
              {operator}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
  const modifierControls = (
    <div
      className={cn(
        "mx-auto grid w-full max-w-xl gap-2",
        mobile ? "grid-cols-4" : "grid-cols-5",
      )}
      aria-label="Modifiers"
    >
      {MODIFIERS.map((modifier) => (
        <Tooltip key={modifier}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={() => addModifier(modifier)}
              disabled={isDisabled}
              aria-label={modifierLabel(modifier)}
              className={cn(mobile ? "h-11" : "h-9", "px-1 text-xs")}
            >
              {modifier}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{modifierDescription(modifier)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
  const numberControls = (
    <div
      className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2"
      aria-label="Number keypad"
    >
      {[7, 8, 9, 4, 5, 6, 1, 2, 3, 0].map((number) => (
        <Button
          type="button"
          key={number}
          variant="outline"
          onClick={() => addNumber(number)}
          disabled={isDisabled}
          className={cn(
            mobile ? "h-11" : "h-10",
            number === 0 && "col-span-3",
          )}
        >
          {number}
        </Button>
      ))}
    </div>
  );

  return (
    <TooltipProvider>
      <div className="relative flex h-full min-h-0 w-full flex-col gap-2 p-2">
        <div
          aria-label="Common dice"
          className={
            mobile
              ? "grid grid-cols-2 gap-2"
              : "grid grid-cols-3 gap-2 xl:grid-cols-6"
          }
        >
          {quickControls}
        </div>

        <Button
          type="button"
          variant="outline"
          aria-expanded={advancedOpen}
          aria-controls={`${advancedId}-controls`}
          onClick={() => {
            if (!advancedOpen) setAdvancedTab(mobile ? "dice" : "modifiers");
            setAdvancedOpen((open) => !open);
          }}
          className={cn(
            "w-full justify-between px-3",
            mobile ? "h-11" : "h-9",
          )}
        >
          <span>Advanced</span>
          <ChevronDown
            data-advanced-indicator
            aria-hidden="true"
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </Button>

        {advancedOpen && (
          <div
            id={`${advancedId}-controls`}
            role={mobile ? "dialog" : "region"}
            aria-label="Advanced dice notation"
            className={cn(
              "flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background p-3",
              mobile
                ? "fixed inset-x-2 bottom-2 top-16 z-50 pt-14 shadow-xl"
                : "flex-1 shadow-sm",
            )}
          >
            {mobile && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAdvancedOpen(false)}
                aria-label="Close advanced notation"
                className="absolute right-3 top-3 h-11 w-11"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            <div
              role="tablist"
              aria-label="Advanced notation categories"
              className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
            >
              {ADVANCED_TABS.map((tab, index) => (
                <button
                  key={tab}
                  id={`${advancedId}-${tab}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={advancedTab === tab}
                  aria-controls={`${advancedId}-${tab}-panel`}
                  tabIndex={advancedTab === tab ? 0 : -1}
                  onClick={() => setAdvancedTab(tab)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight"
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const offset = event.key === "ArrowRight" ? 1 : -1;
                    // SAFETY: The surrounding validation establishes the AdvancedTab invariant used below.
                    const next = ADVANCED_TABS[
                      (index + offset + ADVANCED_TABS.length) %
                        ADVANCED_TABS.length
                    ] as AdvancedTab;
                    setAdvancedTab(next);
                    document
                      .getElementById(`${advancedId}-${next}-tab`)
                      ?.focus();
                  }}
                  className={cn(
                    "rounded px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mobile ? "h-11" : "h-9",
                    advancedTab === tab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ADVANCED_TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            <div
              id={`${advancedId}-${advancedTab}-panel`}
              role="tabpanel"
              aria-labelledby={`${advancedId}-${advancedTab}-tab`}
              className={cn(
                "grid min-h-0 flex-1 items-start justify-items-center py-2",
                mobile && "overflow-y-auto",
              )}
            >
              {advancedTab === "dice" && advancedDiceControls}
              {advancedTab === "modifiers" && modifierControls}
              {advancedTab === "numbers" && numberControls}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
