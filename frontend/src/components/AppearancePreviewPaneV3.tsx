import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { DiceAnimation3D } from "@/components/DiceAnimation3D";
import { PixelatedPreviewImage } from "@/components/PixelatedPreviewImage";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { Button } from "@/components/ui/button";
import { AppearanceApiError } from "@/lib/appearance";
import { applyDiceViewToPreviewModelV4 } from "@/lib/appearance-preview-model";
import {
  getAppearancePreviewV3,
  getAppearancePreviewV4,
} from "@/lib/appearance-v3";
import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceRecipeV3,
} from "@/types/appearance";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  createDefaultDiceViewPreferencesV4,
  type DiceViewPreferencesV4,
  type PublicRenderModelV4,
} from "@dice-witch/dice-v4-model";
import * as React from "react";

type PreviewState = "normal" | "critical-success" | "critical-failure";
type PreviewMode = "design" | "camera";

const CAMERA_BASE_DICE_VIEW = createDefaultDiceViewPreferencesV4();

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
  diceView,
  mode = "design",
}: {
  target: AppearanceEditorTargetV3;
  recipe: AppearanceRecipeV3;
  diceView?: DiceViewPreferencesV4;
  mode?: PreviewMode;
}) {
  const [seed, setSeed] = React.useState(0x51ce_b00c);
  const [state, setState] = React.useState<PreviewState>("normal");
  const [hasDisplayedPreview, setHasDisplayedPreview] = React.useState(false);
  const [cameraBaseModel, setCameraBaseModel] =
    React.useState<PublicRenderModelV4 | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<Error | null>(null);
  const [imageError, setImageError] = React.useState<Error | null>(null);
  const [imageRetryKey, setImageRetryKey] = React.useState(0);
  const handleDisplay = React.useCallback(() => setHasDisplayedPreview(true), []);
  const handleImageError = React.useCallback((error: Error) => {
    setImageError(error);
  }, []);
  const debouncedRecipe = useDebouncedValue(recipe, 300);
  const cameraMode = mode === "camera" && diceView !== undefined;
  const requestedDiceView = cameraMode ? CAMERA_BASE_DICE_VIEW : diceView;
  const previewQuery = useQuery({
    queryKey: [
      diceView === undefined ? "appearancePreviewV3" : "appearancePreviewV4",
      cameraMode ? "camera-base" : "design",
      target,
      seed,
      state,
      debouncedRecipe,
      requestedDiceView,
    ],
    queryFn: () => {
      const input = {
        target,
        recipe: debouncedRecipe,
        seed,
        state,
      };
      return requestedDiceView === undefined
        ? getAppearancePreviewV3(input)
        : getAppearancePreviewV4({ ...input, diceView: requestedDiceView });
    },
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 10_000,
    retry: false,
  });

  React.useEffect(() => {
    setImageError(null);
  }, [previewQuery.data]);

  React.useEffect(() => {
    if (cameraMode && previewQuery.data?.version === 4) {
      setCameraBaseModel(previewQuery.data.renderModel);
      setCameraError(null);
    }
  }, [cameraMode, previewQuery.data]);

  const cameraModel = React.useMemo(
    () =>
      cameraBaseModel === null || diceView === undefined
        ? null
        : applyDiceViewToPreviewModelV4(
            cameraBaseModel,
            recipe,
            seed,
            diceView,
          ),
    [cameraBaseModel, diceView, recipe, seed],
  );
  const handleCameraUnavailable = React.useCallback(
    (error: Error) => setCameraError(error),
    [],
  );

  const retryPreview = () => {
    setImageError(null);
    setImageRetryKey((current) => current + 1);
    void previewQuery.refetch();
  };
  const previewFailure = imageError ??
    (previewQuery.isError ? previewQuery.error : null);
  const previewImage = (
    <PixelatedPreviewImage
      candidate={cameraMode ? undefined : previewQuery.data}
      alt={`${APPEARANCE_TARGET_LABELS[target]} appearance preview`}
      onDisplay={handleDisplay}
      onError={handleImageError}
      retryKey={imageRetryKey}
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
      <div className="grid place-items-center gap-3">
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

  let cameraContent: React.ReactNode;
  if (cameraError !== null) {
    cameraContent = (
      <p role="alert" className="text-sm text-destructive">
        {cameraError.message}
      </p>
    );
  } else if (cameraModel === null && previewQuery.isError) {
    cameraContent = (
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
  } else if (cameraModel === null) {
    cameraContent = <SparkleLoadingIndicator label="Loading preview" />;
  } else {
    cameraContent = (
      <div className="relative h-full w-full">
        <DiceAnimation3D
          className="[&_canvas]:!h-auto [&_canvas]:max-h-full"
          renderModel={cameraModel}
          isRolling={false}
          animateResult
          viewOnlyUpdates
          maximumResultRows={2}
          onReadyChange={setCameraReady}
          onUnavailable={handleCameraUnavailable}
        />
        {!cameraReady && (
          <div className="absolute inset-0 grid place-items-center bg-background">
            <SparkleLoadingIndicator label="Loading preview" />
          </div>
        )}
        {previewQuery.isError && (
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-background/95 p-3 text-center">
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
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Preview"
      data-target={target}
      className="overflow-hidden rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg dark:border-brand/40 dark:bg-select dark:text-card-foreground"
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
        className="mt-4 flex h-72 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-3 dark:border-white/10 dark:bg-black/25"
        aria-busy={previewQuery.isFetching}
        aria-live="polite"
      >
        <div hidden={cameraMode} className={cameraMode ? "hidden" : "contents"}>
          {previewContent}
        </div>
        <div hidden={!cameraMode} className={cameraMode ? "contents" : "hidden"}>
          {cameraContent}
        </div>
      </div>
    </section>
  );
}
