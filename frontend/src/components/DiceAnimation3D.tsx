import type { PublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import * as React from "react";
import { useBrowserMediaQueryV4 } from "./dice-v4-3d/browser-media";
import {
  createThreeRollRendererV4,
  type ThreeRollRendererReplaceOptionsV4,
  type ThreeRollRendererV4,
} from "./dice-v4-3d/roll-renderer";

export interface DiceAnimation3DProps {
  className?: string;
  renderModel?: PublicRenderModelV4 | null;
  isRolling: boolean;
  blankFaces?: boolean;
  appearanceIdentities?: readonly (readonly string[])[];
  rerolledAppearanceIdentities?: readonly string[];
  onReadyChange?: (ready: boolean) => void;
  onUnavailable: (error: Error) => void;
}

export type DiceAnimation3DRendererFactoryV4 =
  typeof createThreeRollRendererV4;

type DiceAnimation3DViewProps = DiceAnimation3DProps & {
  createRenderer: DiceAnimation3DRendererFactoryV4;
};

function asDiceAnimationErrorV4(error: Error, message: string): Error {
  return error.message === "" ? new Error(message) : error;
}

export function DiceAnimation3DView({
  className = "",
  renderModel = null,
  isRolling,
  blankFaces = false,
  appearanceIdentities,
  rerolledAppearanceIdentities,
  onReadyChange,
  onUnavailable,
  createRenderer,
}: DiceAnimation3DViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rendererRef = React.useRef<ThreeRollRendererV4 | null>(null);
  const replacementRevisionRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  const onReadyChangeRef = React.useRef(onReadyChange);
  const onUnavailableRef = React.useRef(onUnavailable);
  const reducedMotionRef = React.useRef(false);
  const hasReadySceneRef = React.useRef(false);
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const reducedMotion = useBrowserMediaQueryV4(
    "(prefers-reduced-motion: reduce)",
  );
  onReadyChangeRef.current = onReadyChange;
  onUnavailableRef.current = onUnavailable;
  reducedMotionRef.current = reducedMotion;

  const enabled = renderModel !== null;

  React.useEffect(() => {
    if (!enabled || containerRef.current === null) return;
    mountedRef.current = true;
    try {
      const renderer = createRenderer(containerRef.current, {
        onUnavailable(error) {
          if (!mountedRef.current) return;
          replacementRevisionRef.current += 1;
          rendererRef.current = null;
          hasReadySceneRef.current = false;
          setStatus("unavailable");
          onReadyChangeRef.current?.(false);
          onUnavailableRef.current(error);
        },
      });
      rendererRef.current = renderer;
    } catch (error) {
      const failure = asDiceAnimationErrorV4(
        error,
        "Three.js V4 renderer failed",
      );
      rendererRef.current = null;
      hasReadySceneRef.current = false;
      setStatus("unavailable");
      onReadyChangeRef.current?.(false);
      onUnavailableRef.current(failure);
    }
    return () => {
      mountedRef.current = false;
      replacementRevisionRef.current += 1;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      hasReadySceneRef.current = false;
    };
  }, [createRenderer, enabled]);

  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null || renderModel === null) return;
    const revision = ++replacementRevisionRef.current;
    const initialReplacement = !hasReadySceneRef.current;
    if (initialReplacement) {
      setStatus("loading");
      onReadyChangeRef.current?.(false);
    }
    const options: ThreeRollRendererReplaceOptionsV4 = {
      animateResult: !blankFaces,
      blankFaces,
      reducedMotion: reducedMotionRef.current,
    };
    if (appearanceIdentities !== undefined) options.appearanceIdentities = appearanceIdentities;
    if (rerolledAppearanceIdentities !== undefined) {
      options.rerolledAppearanceIdentities = rerolledAppearanceIdentities;
    }
    void renderer
      .replaceModel(renderModel, options)
      .then(() => {
        if (
          !mountedRef.current ||
          revision !== replacementRevisionRef.current
        ) {
          return;
        }
        setStatus("ready");
        if (initialReplacement) {
          hasReadySceneRef.current = true;
          onReadyChangeRef.current?.(true);
        }
      })
      .catch((error: Error) => {
        if (
          !mountedRef.current ||
          revision !== replacementRevisionRef.current
        ) {
          return;
        }
        const failure = asDiceAnimationErrorV4(
          error,
          "Three.js V4 renderer failed",
        );
        renderer.dispose();
        rendererRef.current = null;
        hasReadySceneRef.current = false;
        setStatus("unavailable");
        onReadyChangeRef.current?.(false);
        onUnavailableRef.current(failure);
      });
  }, [
    appearanceIdentities,
    blankFaces,
    renderModel,
    rerolledAppearanceIdentities,
  ]);

  React.useEffect(() => {
    rendererRef.current?.setRolling(isRolling, reducedMotion);
  }, [isRolling, reducedMotion]);

  return (
    <div
      className={`relative h-full w-full overflow-x-hidden ${
        blankFaces ? "overflow-y-hidden" : "overflow-y-auto"
      } ${className}`}
      data-three-dice-status={status}
    >
      <div
        ref={containerRef}
        className="h-full min-h-[150px] w-full min-w-[150px]"
        aria-hidden={status !== "ready"}
      />
    </div>
  );
}

export function DiceAnimation3D(props: DiceAnimation3DProps) {
  return (
    <DiceAnimation3DView
      {...props}
      createRenderer={createThreeRollRendererV4}
    />
  );
}
