import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PROCEDURAL_FONT_VALUE = "__procedural-font__";
const MANUAL_TENGWAR_FONT_VALUE = "alcarin-tengwar";

type FontOption<Value extends string> = Readonly<{
  id: Value;
  name: string;
}>;

export function AppearanceFontSelectV3<Value extends string>({
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
  const previewFontFamily = (fontId: Value) =>
    fontId === MANUAL_TENGWAR_FONT_VALUE ? undefined : getFontFamily(fontId);
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
          value === null ? undefined : { fontFamily: previewFontFamily(value) }
        }
      >
        <SelectValue />
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
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
