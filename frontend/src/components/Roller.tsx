import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import type { RollPreparation, RollResponse } from "@/types/dice";
import { SparkleLoadingIndicator } from "./SparkleLoadingIndicator";
import * as React from "react";
import * as z from "zod";
import { AuthoritativeDiceImageGrid } from "./AuthoritativeDiceImageGrid";
import { DiceNotationButtons } from "./DiceNotationButtons";
import type { DiceAnimation3DProps } from "./DiceAnimation3D";
import { useBrowserMediaQueryV4 } from "./dice-v4-3d/browser-media";
import {
  readRollDisplayModeV4,
  writeRollDisplayModeV4,
  type RollDisplayModeV4,
} from "./dice-v4-3d/roll-display-mode";
import { ThreeRendererErrorBoundaryV4 } from "./dice-v4-3d/renderer-error-boundary";

const LazyDiceAnimation3D = React.lazy(async () => {
  const module = await import("./DiceAnimation3D");
  return { default: module.DiceAnimation3D };
});

const MOBILE_QUERY_V4 = "(max-width: 639px)";
const WEBGL_NOTICE_V4 =
  "This browser could not continue displaying 3D dice. Showing the authoritative 2D result instead.";
const PREVIEW_NOTICE_V4 =
  "The 3D dice preview is unavailable. A completed roll will still use its authoritative 2D result.";

export interface RollerProps {
  rollPreparation: RollPreparation | null;
  rollResults: RollResponse | null;
  isPreparing: boolean;
  isRolling: boolean;
  isResultStale?: boolean;
  input: string;
  setInput: (value: string) => void;
  selectedChannel: boolean;
  mobileView: "controls" | "result";
}

export type RollerSlots = {
  DiceAnimation3DSlot: React.ComponentType<DiceAnimation3DProps>;
  DiceNotationButtonsSlot: typeof DiceNotationButtons;
  ResizablePanelGroupSlot: typeof ResizablePanelGroup;
  ResizablePanelSlot: typeof ResizablePanel;
  ResizableHandleSlot: typeof ResizableHandle;
};

function initialRollDisplayModeV4(): RollDisplayModeV4 {
  const browser = z.object({ matchMedia: z.function() }).safeParse(globalThis);
  const mobile = browser.success && window.matchMedia(MOBILE_QUERY_V4).matches;
  try {
    return readRollDisplayModeV4(window.localStorage, mobile);
  } catch {
    return mobile ? "2d" : "3d";
  }
}

function RollResultText({ results }: { results: RollResponse }) {
  return (
    <div className="flex flex-col items-center px-4 text-center">
      <div className="text-4xl font-extrabold text-white [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000,0_0_12px_rgba(0,0,0,0.8)] sm:text-5xl">
        {results.resultArray.length > 0 &&
        results.resultArray[0]?.results !== undefined
          ? results.resultArray[0].results
          : "Error"}
      </div>
      <div className="mt-2 text-base text-white [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000,0_0_8px_rgba(0,0,0,0.8)] sm:text-xl">
        {results.resultArray.length > 0
          ? results.resultArray.map((result, index) => (
              <span key={`${String(index)}-${result.output}`} className="mx-1">
                {index > 0 ? " + " : ""}
                {result.output}
              </span>
            ))
          : results.message || "Invalid notation"}
      </div>
    </div>
  );
}

function DiceDisplayModeToggle({
  mode,
  threeDimensionalAvailable,
  onChange,
}: {
  mode: RollDisplayModeV4;
  threeDimensionalAvailable: boolean;
  onChange: (mode: RollDisplayModeV4) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Dice display mode"
      className="flex rounded-md border border-border/80 bg-background/90 p-0.5 shadow-sm backdrop-blur-sm"
    >
      <Button
        type="button"
        size="sm"
        variant={mode === "2d" ? "default" : "ghost"}
        className="h-11 px-2 text-xs sm:h-7"
        aria-pressed={mode === "2d"}
        onClick={() => onChange("2d")}
      >
        Show 2D dice
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "3d" ? "default" : "ghost"}
        className="h-11 px-2 text-xs sm:h-7"
        aria-pressed={mode === "3d"}
        disabled={!threeDimensionalAvailable}
        onClick={() => onChange("3d")}
      >
        Show 3D dice
      </Button>
    </div>
  );
}

function DiceResultDisplay({
  DiceAnimation3DSlot,
  rollPreparation,
  rollResults,
  isPreparing,
  isRolling,
  isResultStale,
  displayMode,
  onDisplayModeChange,
}: {
  DiceAnimation3DSlot: RollerSlots["DiceAnimation3DSlot"];
  rollPreparation: RollPreparation | null;
  rollResults: RollResponse | null;
  isPreparing: boolean;
  isRolling: boolean;
  isResultStale: boolean;
  displayMode: RollDisplayModeV4;
  onDisplayModeChange: (mode: RollDisplayModeV4) => void;
}) {
  const [threeStarted, setThreeStarted] = React.useState(false);
  const [runtimeUnavailable, setRuntimeUnavailable] = React.useState(false);
  const currentRollResults = isResultStale ? null : rollResults;
  const hasResult = currentRollResults !== null;
  const activeRenderModel =
    currentRollResults?.renderModel ?? rollPreparation?.renderModel;
  const activeImage =
    currentRollResults?.renderedImage ?? rollPreparation?.renderedImage;
  const activeAppearanceIdentities =
    currentRollResults?.appearanceIdentities ?? rollPreparation?.appearanceIdentities;
  const rerolledAppearanceIdentities =
    currentRollResults?.rerolledAppearanceIdentities;
  const groupSizes = hasResult
    ? currentRollResults.diceArray.map((group) => group.length)
    : (rollPreparation?.groupSizes ?? []);
  const iconsByGroup = hasResult
    ? currentRollResults.diceArray.map((group) => group.map((die) => die.icon))
    : undefined;
  const hasAuthoritativeThree = activeRenderModel !== undefined;
  const showThree =
    displayMode === "3d" &&
    !runtimeUnavailable &&
    hasAuthoritativeThree;
  const effectiveMode: RollDisplayModeV4 = showThree ? "3d" : "2d";
  const showImage = activeImage !== undefined && effectiveMode === "2d";
  const showLoader =
    displayMode === "3d" &&
    !runtimeUnavailable &&
    !threeStarted &&
    (isPreparing || showThree);
  let notice: string | null = null;

  React.useEffect(() => {
    if (!hasAuthoritativeThree) setThreeStarted(false);
  }, [hasAuthoritativeThree]);

  if (runtimeUnavailable) {
    notice =
      activeImage === undefined ? PREVIEW_NOTICE_V4 : WEBGL_NOTICE_V4;
  }

  const handleReadyChange = React.useCallback((ready: boolean): void => {
    if (ready) setThreeStarted(true);
  }, []);

  const handleUnavailable = React.useCallback(() => {
    setThreeStarted(false);
    setRuntimeUnavailable(true);
  }, []);

  const handleModeChange = (mode: RollDisplayModeV4): void => {
    setThreeStarted(false);
    setRuntimeUnavailable(false);
    onDisplayModeChange(mode);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {currentRollResults !== null && (
        <div className="z-30 flex max-h-[35%] flex-none justify-center overflow-x-hidden overflow-y-auto border-b bg-background/90 py-2">
          <RollResultText results={currentRollResults} />
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/15">
        {showThree && (
          <div className="absolute inset-0 z-10">
            <ThreeRendererErrorBoundaryV4 onUnavailable={handleUnavailable}>
              <React.Suspense fallback={null}>
                <DiceAnimation3DSlot
                  renderModel={activeRenderModel ?? null}
                  appearanceIdentities={activeAppearanceIdentities}
                  rerolledAppearanceIdentities={rerolledAppearanceIdentities}
                  isRolling={isRolling}
                  blankFaces={!hasResult}
                  onReadyChange={handleReadyChange}
                  onUnavailable={handleUnavailable}
                />
              </React.Suspense>
            </ThreeRendererErrorBoundaryV4>
          </div>
        )}

        {showImage && activeImage !== undefined && (
          <div className="absolute inset-0 z-20 overflow-x-hidden overflow-y-auto p-4 pb-12">
            <AuthoritativeDiceImageGrid
              image={activeImage}
              groupSizes={groupSizes}
              iconsByGroup={iconsByGroup}
              blankFaces={!hasResult}
            />
          </div>
        )}

        {showLoader && (
          <SparkleLoadingIndicator
            label="Loading 3D dice"
            className="pointer-events-none absolute inset-0 z-30 bg-background/45"
          />
        )}

        {activeImage !== undefined && (
          <div className="absolute bottom-2 right-2 z-40">
            <DiceDisplayModeToggle
              mode={effectiveMode}
              threeDimensionalAvailable={hasAuthoritativeThree}
              onChange={handleModeChange}
            />
          </div>
        )}

        {notice !== null && (
          <p
            role="alert"
            className="absolute bottom-12 left-2 right-2 z-40 rounded-md border border-warning-border bg-background/95 px-3 py-2 text-sm text-foreground shadow-sm"
          >
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

export function RollerView({
  slots,
  rollPreparation,
  rollResults,
  isPreparing,
  isRolling,
  isResultStale = false,
  input,
  setInput,
  selectedChannel,
  mobileView,
}: RollerProps & { slots: RollerSlots }) {
  const {
    DiceAnimation3DSlot,
    DiceNotationButtonsSlot,
    ResizablePanelGroupSlot,
    ResizablePanelSlot,
    ResizableHandleSlot,
  } = slots;
  const isMobile = useBrowserMediaQueryV4(MOBILE_QUERY_V4);
  const [displayMode, setDisplayMode] = React.useState<RollDisplayModeV4>(
    initialRollDisplayModeV4,
  );

  React.useEffect(() => {
    setDisplayMode(readRollDisplayModeV4(window.localStorage, isMobile));
  }, [isMobile]);

  const handleDisplayModeChange = React.useCallback(
    (mode: RollDisplayModeV4): void => {
      setDisplayMode(mode);
      try {
        writeRollDisplayModeV4(window.localStorage, mode, isMobile);
      } catch {
        // The current browser session still retains the explicit choice.
      }
    },
    [isMobile],
  );

  const display = (
    <DiceResultDisplay
      DiceAnimation3DSlot={DiceAnimation3DSlot}
      rollPreparation={rollPreparation}
      rollResults={rollResults}
      isPreparing={isPreparing}
      isRolling={isRolling}
      isResultStale={isResultStale}
      displayMode={displayMode}
      onDisplayModeChange={handleDisplayModeChange}
    />
  );

  if (isMobile) {
    return mobileView === "result" ? (
      <div
        className="h-full min-h-0 overflow-hidden rounded-lg border"
        aria-busy={isPreparing || isRolling}
      >
        {display}
      </div>
    ) : (
      <div
        className="h-full min-h-0 overflow-y-auto rounded-lg border"
        aria-busy={isPreparing || isRolling}
      >
        <DiceNotationButtonsSlot
          input={input}
          setInput={setInput}
          isDisabled={!selectedChannel}
        />
      </div>
    );
  }

  return (
    <ResizablePanelGroupSlot
      direction="horizontal"
      className="h-full min-h-0 rounded-lg border"
      aria-busy={isPreparing || isRolling}
    >
      <ResizablePanelSlot defaultSize={34} minSize={25}>
        <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden p-2">
          <DiceNotationButtonsSlot
            input={input}
            setInput={setInput}
            isDisabled={!selectedChannel}
          />
        </div>
      </ResizablePanelSlot>
      <ResizableHandleSlot />
      <ResizablePanelSlot defaultSize={66} minSize={45}>
        {display}
      </ResizablePanelSlot>
    </ResizablePanelGroupSlot>
  );
}

const productionRollerSlots = {
  DiceAnimation3DSlot: LazyDiceAnimation3D,
  DiceNotationButtonsSlot: DiceNotationButtons,
  ResizablePanelGroupSlot: ResizablePanelGroup,
  ResizablePanelSlot: ResizablePanel,
  ResizableHandleSlot: ResizableHandle,
} satisfies RollerSlots;

export function Roller(props: RollerProps) {
  return <RollerView {...props} slots={productionRollerSlots} />;
}
