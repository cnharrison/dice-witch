import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { Button } from "@/components/ui/button";
import { AppearanceApiError } from "@/lib/appearance";
import { getAppearancePreviewV3 } from "@/lib/appearance-v3";
import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceRecipeV3,
} from "@/types/appearance";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import * as React from "react";

type PreviewState = "normal" | "critical-success" | "critical-failure";

function randomUint32(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (value === undefined) throw new Error("Random seed generation failed");
  return value;
}

function useDebouncedValue<Value>(value: Value, delay: number): Value {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function previewErrorMessage(error: unknown): string {
  if (!(error instanceof AppearanceApiError)) {
    return error instanceof Error ? error.message : "Preview is unavailable.";
  }
  switch (error.code) {
    case "appearance_preview_invalid":
    case "appearance_preview_request_invalid":
      return "This draft contains a combination the renderer cannot preview.";
    case "appearance_renderer_failed":
      return "The V4 renderer could not complete this preview.";
    case "appearance_authentication_required":
      return "Sign in again to render appearance previews.";
    default:
      return "The appearance preview service is unavailable.";
  }
}

export function AppearancePreviewPaneV3({
  target,
  recipe,
}: {
  target: AppearanceEditorTargetV3;
  recipe: AppearanceRecipeV3;
}) {
  const [seed, setSeed] = React.useState(0x51ce_b00c);
  const [state, setState] = React.useState<PreviewState>("normal");
  const debouncedRecipe = useDebouncedValue(recipe, 300);
  const isExpanded = target === "all";
  const previewQuery = useQuery({
    queryKey: ["appearancePreviewV3", target, seed, state, debouncedRecipe],
    queryFn: () =>
      getAppearancePreviewV3({
        target,
        recipe: debouncedRecipe,
        seed,
        state,
      }),
    staleTime: Infinity,
    gcTime: 10_000,
    retry: false,
  });

  let previewContent: React.ReactNode;
  if (previewQuery.isLoading || previewQuery.isFetching) {
    previewContent = <SparkleLoadingIndicator label="Loading preview" />;
  } else if (previewQuery.isError) {
    previewContent = (
      <div className="space-y-3 text-center">
        <p role="alert" className="text-sm text-destructive">
          {previewErrorMessage(previewQuery.error)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void previewQuery.refetch()}
        >
          Retry preview
        </Button>
      </div>
    );
  } else if (previewQuery.data) {
    previewContent = (
      <img
        src={`data:${previewQuery.data.contentType};base64,${previewQuery.data.base64}`}
        width={previewQuery.data.width}
        height={previewQuery.data.height}
        alt={`${APPEARANCE_TARGET_LABELS[target]} appearance preview`}
        className="h-auto max-w-full object-contain"
      />
    );
  } else {
    previewContent = (
      <p role="alert" className="text-sm text-destructive">
        Preview is unavailable.
      </p>
    );
  }

  return (
    <section
      aria-label="Preview"
      data-expanded={isExpanded}
      className="overflow-hidden rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg dark:border-brand/40 dark:bg-select dark:text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Preview
          </h2>
          <p className="text-sm text-muted-foreground">
            {APPEARANCE_TARGET_LABELS[target]}
          </p>
        </div>
        <div className="flex gap-2">
          <AppearanceSelectV3
            aria-label="Preview critical state"
            value={state}
            onChange={(event) => setState(event.target.value as PreviewState)}
            className="border-input text-xs text-foreground dark:border-white/20 dark:bg-black/30 dark:text-white"
            containerClassName="min-w-40"
          >
            <option value="normal">Normal</option>
            <option value="critical-success">Critical success</option>
            <option value="critical-failure">Critical failure</option>
          </AppearanceSelectV3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSeed(randomUint32())}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reseed
          </Button>
        </div>
      </div>
      <div
        className={`mt-4 flex items-center justify-center overflow-auto rounded-lg border border-border bg-background p-3 dark:border-white/10 dark:bg-black/25 ${isExpanded ? "min-h-80" : "min-h-72"}`}
        aria-busy={previewQuery.isFetching}
        aria-live="polite"
      >
        {previewContent}
      </div>
    </section>
  );
}
