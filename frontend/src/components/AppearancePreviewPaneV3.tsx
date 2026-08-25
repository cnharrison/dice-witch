import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { PixelatedPreviewImage } from "@/components/PixelatedPreviewImage";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { Button } from "@/components/ui/button";
import { AppearanceApiError } from "@/lib/appearance-api-error";
import { getAppearancePreviewV4 } from "@/lib/appearance-v4";
import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceRecipeV3,
} from "@/types/appearance";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AppearanceTargetV4,
  DiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
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
  if (!(error instanceof AppearanceApiError)) return "Error. Try again.";
  switch (error.code) {
    case "appearance_preview_invalid":
    case "appearance_preview_request_invalid":
      return "This draft contains a combination the renderer cannot preview.";
    case "appearance_renderer_failed":
      return "Error. Try again.";
    case "appearance_authentication_required":
      return "Sign in again to render appearance previews.";
    default:
      return "Error. Try again.";
  }
}

export function AppearancePreviewPaneV3({
  target,
  recipe,
  diceView,
  overrides,
}: {
  target: AppearanceEditorTargetV3;
  recipe: AppearanceRecipeV3;
  diceView: DiceViewPreferencesV4;
  // Per-die designs shown as-is inside the ALL composite preview.
  overrides?: Readonly<Partial<Record<AppearanceTargetV4, AppearanceRecipeV3>>>;
}) {
  const [seed, setSeed] = React.useState(0x51ce_b00c);
  const [state, setState] = React.useState<PreviewState>("normal");
  const [hasDisplayedPreview, setHasDisplayedPreview] = React.useState(false);
  const [imageError, setImageError] = React.useState<Error | null>(null);
  const [imageRetryKey, setImageRetryKey] = React.useState(0);
  const activeOverrides =
    target === "all" && Object.keys(overrides ?? {}).length > 0
      ? overrides
      : undefined;
  const previewDraft = React.useMemo(
    () => ({ recipe, diceView, overrides: activeOverrides }),
    [activeOverrides, diceView, recipe],
  );
  const debouncedDraft = useDebouncedValue(previewDraft, 300);
  const previewQuery = useQuery({
    queryKey: [
      "appearancePreviewV4",
      target,
      seed,
      state,
      debouncedDraft,
    ],
    queryFn: ({ signal }) => {
      const input = {
        target,
        recipe: debouncedDraft.recipe,
        seed,
        state,
        diceView: debouncedDraft.diceView,
        ...(target === "all" && debouncedDraft.overrides !== undefined
          ? { overrides: debouncedDraft.overrides }
          : {}),
      };
      return getAppearancePreviewV4(input, signal);
    },
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 10_000,
    retry: false,
  });

  React.useEffect(() => setImageError(null), [previewQuery.data]);

  const retryPreview = () => {
    setImageError(null);
    setImageRetryKey((current) => current + 1);
    void previewQuery.refetch();
  };
  const previewFailure = imageError ??
    (previewQuery.isError ? previewQuery.error : null);
  const displayedPreviewClassName = previewFailure === null
    ? "grid h-full min-h-0 w-full place-items-center"
    : "grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto] place-items-center gap-3";
  const previewImage = (
    <PixelatedPreviewImage
      candidate={previewQuery.data}
      alt={`${APPEARANCE_TARGET_LABELS[target]} appearance preview`}
      onDisplay={() => setHasDisplayedPreview(true)}
      onError={setImageError}
      retryKey={imageRetryKey}
      fitContainer
    />
  );

  let previewContent: React.ReactNode;
  if (!hasDisplayedPreview && previewFailure !== null) {
    previewContent = (
      <div className="space-y-3 text-center">
        <p role="alert" className="text-sm text-destructive">
          {previewErrorMessage(previewFailure)}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={retryPreview}>
          Retry preview
        </Button>
      </div>
    );
  } else if (!hasDisplayedPreview) {
    previewContent = (
      <>
        {previewImage}
        <SparkleLoadingIndicator label="Loading preview" />
      </>
    );
  } else {
    previewContent = (
      <div className={displayedPreviewClassName}>
        {previewImage}
        {previewFailure !== null && (
          <div className="space-y-2 text-center">
            <p role="alert" className="text-sm text-destructive">
              {previewErrorMessage(previewFailure)}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={retryPreview}>
              Retry preview
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Preview"
      data-target={target}
      className="appearance-preview-card overflow-hidden rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg dark:border-brand/40 dark:bg-select dark:text-card-foreground"
    >
      <div className="flex flex-wrap justify-end gap-2">
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
        className="appearance-preview-canvas mt-4 flex h-72 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-3 dark:border-white/10 dark:bg-black/25"
        aria-busy={previewQuery.isFetching}
        aria-live="polite"
      >
        {previewContent}
      </div>
    </section>
  );
}
