import { Button } from "@/components/ui/button";
import { getAppearancePreview } from "@/lib/appearance";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceEditorTarget,
  type AppearancePreview,
  type AppearanceRecipeV2,
} from "@/types/appearance";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import * as React from "react";

function randomUint32(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (value === undefined) throw new Error("Random seed generation failed");
  return value;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

export function AppearancePreviewPane({
  target,
  recipe,
}: {
  target: AppearanceEditorTarget;
  recipe: AppearanceRecipeV2;
}) {
  const [seed, setSeed] = React.useState(0x51ce_b00c);
  const [state, setState] = React.useState<
    "normal" | "critical-success" | "critical-failure"
  >("normal");
  const isExpanded = target === "all";
  const debouncedRecipe = useDebouncedValue(recipe, 300);
  const previewQuery = useQuery<AppearancePreview>({
    queryKey: ["appearancePreview", target, seed, state, debouncedRecipe],
    queryFn: () =>
      getAppearancePreview({
        target,
        recipe: debouncedRecipe,
        seed,
        state,
      }),
    staleTime: Infinity,
    gcTime: 10_000,
    retry: 1,
  });

  let previewContent: React.ReactNode;
  if (previewQuery.isLoading || previewQuery.isFetching) {
    previewContent = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-white/70">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Rendering preview…
      </div>
    );
  } else if (previewQuery.data) {
    previewContent = (
      <img
        src={`data:${previewQuery.data.contentType};base64,${previewQuery.data.base64}`}
        width={previewQuery.data.width}
        height={previewQuery.data.height}
        alt={`${APPEARANCE_TARGET_LABELS[target]} appearance preview`}
        className={`h-auto w-full object-contain ${isExpanded ? "max-w-none" : "max-w-[32rem]"}`}
      />
    );
  } else {
    previewContent = (
      <p role="alert" className="text-sm text-destructive dark:text-rose-200">
        {previewQuery.error instanceof Error
          ? previewQuery.error.message
          : "Preview is unavailable."}
      </p>
    );
  }

  return (
    <section
      aria-label="Preview"
      data-expanded={isExpanded}
      className="overflow-hidden rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg dark:border-fuchsia-500/40 dark:bg-[#170a16] dark:text-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fuchsia-800 dark:text-fuchsia-200">
            Preview
          </h2>
          <p className="text-sm text-muted-foreground dark:text-white/70">
            {APPEARANCE_TARGET_LABELS[target]}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Preview critical state"
            value={state}
            onChange={(event) =>
              setState(
                event.target.value as
                  | "normal"
                  | "critical-success"
                  | "critical-failure",
              )
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground dark:border-white/20 dark:bg-black/30 dark:text-white"
          >
            <option value="normal">Normal</option>
            <option value="critical-success">Critical success</option>
            <option value="critical-failure">Critical failure</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSeed(randomUint32())}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reseed
          </Button>
        </div>
      </div>
      <div
        className={`mt-4 flex items-center justify-center rounded-lg border border-border bg-background p-3 dark:border-white/10 dark:bg-black/25 ${isExpanded ? "min-h-80" : "min-h-72"}`}
        aria-busy={previewQuery.isFetching}
      >
        {previewContent}
      </div>
    </section>
  );
}
