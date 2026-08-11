import type { FontIdV4 } from "@dice-witch/dice-v4-model";
import { loadBrowserFontV4 } from "@/components/dice-v4-3d/font-assets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const PROCEDURAL_FONT_VALUE = "__procedural-font__";
const MANUAL_TENGWAR_FONT_VALUE = "alcarin-tengwar";

type FontOption<Value extends FontIdV4> = Readonly<{
  id: Value;
  name: string;
}>;

export function AppearanceFontSelectV3<Value extends FontIdV4>({
  "aria-label": ariaLabel,
  value,
  options,
  procedural = false,
  className,
  getFontFamily,
  onChange,
}: {
  "aria-label": string;
  value: Value | null;
  options: readonly FontOption<Value>[];
  procedural?: boolean;
  className?: string;
  getFontFamily(value: Value): string;
  onChange(value: Value): void;
}) {
  const previewFontFamily = (fontId: Value) => getFontFamily(fontId);
  const selectedOption = options.find((option) => option.id === value);
  useEffect(() => {
    if (options.some(({ id }) => id === MANUAL_TENGWAR_FONT_VALUE)) {
      void loadBrowserFontV4(MANUAL_TENGWAR_FONT_VALUE).catch(() => undefined);
    }
  }, [options]);
  const optionLabel = (option: FontOption<Value>) => option.name;
  let selectedLabel: string | undefined;
  if (selectedOption !== undefined) selectedLabel = optionLabel(selectedOption);
  else if (procedural) selectedLabel = "Procedural mix";

  return (
    <Select
      value={value ?? PROCEDURAL_FONT_VALUE}
      onValueChange={(nextValue) => {
        if (nextValue !== PROCEDURAL_FONT_VALUE) onChange(nextValue as Value);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("h-11 sm:h-9", className)}
        style={
          value === null
            ? undefined
            : { fontFamily: previewFontFamily(value) }
        }
      >
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {procedural && (
          <SelectItem value={PROCEDURAL_FONT_VALUE}>Procedural mix</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem
            key={option.id}
            value={option.id}
            style={{ fontFamily: previewFontFamily(option.id) }}
          >
            {optionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
