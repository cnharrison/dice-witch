import { APPEARANCE_TARGET_LABELS } from "@/types/appearance";
import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import { AppearanceSelectV3 } from "./AppearanceSelectV3";

const POLYHEDRAL_TARGETS = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;
const RELATED_TARGETS = ["percentile", "fudge", "other"] as const;

export function AppearanceTargetPickerV3({
  value,
  disabled = false,
  onChange,
}: {
  value: AppearanceEditorTargetV3;
  disabled?: boolean;
  onChange(value: AppearanceEditorTargetV3): void;
}) {
  return (
    <label className="block max-w-sm space-y-1.5 text-sm font-semibold">
      <span className="block">Appearance target</span>
      <AppearanceSelectV3
        aria-label="Appearance target"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as AppearanceEditorTargetV3)
        }
        className="font-normal sm:h-10"
      >
        <option value="all">{APPEARANCE_TARGET_LABELS.all}</option>
        <optgroup label="Standard dice">
          {POLYHEDRAL_TARGETS.map((target) => (
            <option key={target} value={target}>
              {target === "d20"
                ? `${APPEARANCE_TARGET_LABELS[target]} · special forms`
                : APPEARANCE_TARGET_LABELS[target]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Other dice">
          {RELATED_TARGETS.map((target) => (
            <option key={target} value={target}>
              {APPEARANCE_TARGET_LABELS[target]}
            </option>
          ))}
        </optgroup>
      </AppearanceSelectV3>
    </label>
  );
}
