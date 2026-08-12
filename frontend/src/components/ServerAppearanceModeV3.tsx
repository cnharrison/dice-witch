import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GuildAppearanceProfileV4 } from "@dice-witch/dice-v4-model";
import * as React from "react";

const MODE_OPTIONS = [
  {
    value: "off",
    label: "Off",
    description:
      "Dice Witch does not apply a server design. Each member's personal design remains active.",
  },
  {
    value: "default",
    label: "Default",
    description:
      "Members use their personal design when set; the server design fills targets they have not customized.",
  },
  {
    value: "enforced",
    label: "Enforced",
    description:
      "The server design overrides personal designs for every configured target.",
  },
] as const;

type ServerAppearanceModeV3Props = {
  mode: GuildAppearanceProfileV4["mode"];
  disabled?: boolean;
  onChange(mode: GuildAppearanceProfileV4["mode"]): Promise<void>;
};

export function ServerAppearanceModeV3({
  mode,
  disabled = false,
  onChange,
}: ServerAppearanceModeV3Props) {
  const descriptionPrefix = React.useId();
  const [selectedMode, setSelectedMode] = React.useState(mode);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    setSelectedMode(mode);
  }, [mode]);

  const selectMode = async (nextMode: GuildAppearanceProfileV4["mode"]) => {
    if (disabled || saving || nextMode === selectedMode) return;
    const previousMode = selectedMode;
    setSelectedMode(nextMode);
    setSaving(true);
    setStatus(null);
    try {
      await onChange(nextMode);
      setStatus({ kind: "success", message: "Server styling mode was saved." });
    } catch {
      setSelectedMode(previousMode);
      setStatus({
        kind: "error",
        message: "Server styling mode could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset
      disabled={disabled || saving}
      aria-busy={saving}
      className="rounded-lg border bg-muted/20 p-4"
    >
      <legend className="px-1 text-sm font-semibold">
        Server styling mode
      </legend>
      <TooltipProvider>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map(({ value, label, description }) => {
            const descriptionId = `${descriptionPrefix}-${value}`;
            return (
              <React.Fragment key={value}>
                <span id={descriptionId} className="sr-only">
                  {description}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label
                      className={`flex items-start gap-2 rounded-md border p-3 transition-colors ${
                        selectedMode === value
                          ? "border-brand/70 bg-brand/10"
                          : "bg-background"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${descriptionPrefix}-mode`}
                        value={value}
                        checked={selectedMode === value}
                        aria-describedby={descriptionId}
                        onChange={() => void selectMode(value)}
                        className="mt-1"
                      />
                      <span className="block text-sm font-medium">
                        {label}
                      </span>
                    </label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{description}</p>
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </div>
      </TooltipProvider>
      {status !== null && (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className="mt-3 text-sm text-muted-foreground"
        >
          {status.message}
        </p>
      )}
    </fieldset>
  );
}
