import {
  formatEngravingLabelV4,
  type FontIdV4,
} from "@dice-witch/dice-v4-model";
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
const TENGWAR_NUMERAL_PREVIEW = formatEngravingLabelV4(
  MANUAL_TENGWAR_FONT_VALUE,
  "20",
);

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
  const latinPreviewFontFamily = (fontId: Value) =>
    fontId === MANUAL_TENGWAR_FONT_VALUE
      ? undefined
      : previewFontFamily(fontId);
  const selectedOption = options.find((option) => option.id === value);
  useEffect(() => {
    if (options.some(({ id }) => id === MANUAL_TENGWAR_FONT_VALUE)) {
      void loadBrowserFontV4(MANUAL_TENGWAR_FONT_VALUE).catch(() => undefined);
    }
  }, [options]);
  const optionLabel = (option: FontOption<Value>) =>
    option.id === MANUAL_TENGWAR_FONT_VALUE ? (
      <span className="flex w-full items-center justify-between gap-3">
        <span>{option.name}</span>
        <span
          aria-hidden="true"
          style={{ fontFamily: previewFontFamily(option.id) }}
        >
          {TENGWAR_NUMERAL_PREVIEW}
        </span>
      </span>
    ) : (
      option.name
    );
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
            : { fontFamily: latinPreviewFontFamily(value) }
        }
      >
        <SelectValue>
          {selectedOption === undefined ? undefined : optionLabel(selectedOption)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {procedural && (
          <SelectItem value={PROCEDURAL_FONT_VALUE}>Procedural mix</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem
            key={option.id}
            value={option.id}
            style={{ fontFamily: latinPreviewFontFamily(option.id) }}
          >
            {optionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
