import * as React from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomColorPickerDialog } from "@/components/CustomColorPickerDialog";
import {
  generateLibraryRollColorSuggestions,
  libraryRollColorVariants,
} from "@/lib/library-roll-color";

const DEFAULT_CUSTOM_COLOR = "#F083B5";

export function LibraryRollColorPicker({
  value,
  usedColors,
  disabled = false,
  onChange,
}: Readonly<{
  value: string | null;
  usedColors: readonly string[];
  disabled?: boolean;
  onChange: (color: string | null) => void;
}>) {
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState(() =>
    generateLibraryRollColorSuggestions([
      ...usedColors,
      ...(value === null ? [] : [value]),
    ]),
  );

  const setPickerOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setSuggestions(generateLibraryRollColorSuggestions([
        ...usedColors,
        ...(value === null ? [] : [value]),
      ]));
    }
    setOpen(nextOpen);
  };

  const selectColor = (color: string) => {
    const selectedIndex = suggestions.indexOf(color);
    if (selectedIndex !== -1) {
      const remaining = suggestions.filter((_, index) => index !== selectedIndex);
      const [replacement] = generateLibraryRollColorSuggestions(
        [...usedColors, color, ...remaining],
        1,
      );
      if (replacement !== undefined) {
        setSuggestions(suggestions.map((suggestion, index) =>
          index === selectedIndex ? replacement : suggestion,
        ));
      }
    }
    onChange(color);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="justify-start"
        onClick={() => setPickerOpen(true)}
      >
        <span
          className="h-4 w-4 rounded-sm border"
          style={{ backgroundColor: value ?? "currentColor" }}
          aria-hidden="true"
        />
        <Palette className="h-4 w-4" aria-hidden="true" />
        {value === null ? "Default text color" : value}
      </Button>
      <CustomColorPickerDialog
        open={open}
        onOpenChange={setPickerOpen}
        value={value ?? DEFAULT_CUSTOM_COLOR}
        selectedColor={value}
        onChange={selectColor}
        title="Roll name color"
        description="Choose a base color. Dice Witch adjusts it for readable light and dark variants."
        visuallyHideHeader
        suggestedColors={suggestions}
        defaultChoice={{
          label: "Default",
          selected: value === null,
          onSelect: () => onChange(null),
        }}
        renderPreview={(color) => <ColorPreview color={color} />}
      />
    </>
  );
}

function ColorPreview({ color }: Readonly<{ color: string }>) {
  const variants = libraryRollColorVariants(color);
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border text-sm font-semibold">
      <span
        className="bg-[hsl(35_42%_84%)] p-3"
        style={{ color: variants.light }}
      >
        Light preview
      </span>
      <span
        className="bg-[hsl(0_0%_3.9%)] p-3"
        style={{ color: variants.dark }}
      >
        Dark preview
      </span>
    </div>
  );
}
