import type { PublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import { Quaternion, WebGLRenderer } from "three";
import {
  createThreeDiceGridResourcesV4,
  disposeThreeDiceGridResourcesV4,
  prepareThreeDiceGridV4,
  type ThreeDiceGridResourcesV4,
} from "./grid-resources";
import {
  createThreeDiceGridRenderContextV4,
  disposeThreeDiceGridRenderContextV4,
  renderThreeDiceGridV4,
  type ThreeDiceGridRenderContextV4,
} from "./grid-render";
import { THREE_DICE_GRID_CELL_SIZE_V4 } from "./grid-layout";
import { geometryDescriptorForDieV4 } from "./geometry";
import {
  createTrayPhysicsV4,
  freshMotionSeedV4,
  type TrayDieInputV4,
  type TrayPhysicsV4,
} from "./tray-physics";
import {
  addThreeTraySmokeV4,
  applyTraySnapshotToGroupV4,
  configureThreeTrayCameraV4,
  createThreeTrayRenderContextV4,
  disposeThreeTrayRenderContextV4,
  renderThreeTrayV4,
  resetTrayGroupTransformV4,
  traySnapshotViewportV4,
  updateThreeTraySmokeV4,
  type ThreeTrayRenderContextV4,
} from "./tray-render";
import type { ThreeDiceGridViewportV4 } from "./grid-layout";
import {
  assertThreeDrawingBufferSizeV4,
  readThreeDrawingBufferLimitsV4,
  type ThreeDrawingBufferLimitsV4,
} from "./webgl-capabilities";

export const THREE_RESULT_TRANSITION_MILLISECONDS_V4 = 400;
const IDENTITY_QUATERNION_V4 = new Quaternion();

export type ThreeRollRendererReplaceOptionsV4 = {
  animateResult: boolean;
  blankFaces: boolean;
  reducedMotion: boolean;
  appearanceIdentities?: readonly (readonly string[])[];
  rerolledAppearanceIdentities?: readonly string[];
};

export type ThreeRollRendererV4 = {
  replaceModel(
    model: PublicRenderModelV4,
    options: ThreeRollRendererReplaceOptionsV4,
  ): Promise<void>;
  setRolling(rolling: boolean, reducedMotion: boolean): void;
  dispose(): void;
};

export type ThreeRollRendererCallbacksV4 = {
  onUnavailable(error: Error): void;
};

type SettleStateV4 = {
  startedAt: number;
  initial: Quaternion[];
};

type TrayStateV4 = {
  kind: "tray";
  lastFrameAt: number;
  width: number;
  height: number;
  inputs: readonly TrayDieInputV4[];
  physics: TrayPhysicsV4;
};

type ResultTransitionEntryV4 = {
  from: ThreeDiceGridViewportV4;
  to: ThreeDiceGridViewportV4;
  initialRotation: Quaternion;
  spawnDelay: number;
};

type ResultTransitionStateV4 = {
  kind: "result-transition";
  startedAt: number;
  transientEntryCount: number;
  width: number;
  height: number;
  finalWidth: number;
  finalHeight: number;
  entries: ResultTransitionEntryV4[];
};

type PresentationStateV4 = TrayStateV4 | ResultTransitionStateV4 | null;

type CapturedPresentationV4 = {
  width: number;
  height: number;
  viewports: ReadonlyMap<string, ThreeDiceGridViewportV4>;
  rotations: ReadonlyMap<string, Quaternion>;
};

function asErrorV4(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Three.js V4 renderer failed");
}

function easedSettleProgressV4(progress: number): number {
  const bounded = Math.min(1, Math.max(0, progress));
  return 1 - (1 - bounded) ** 3;
}

function rollingRotationV4(
  seed: number,
  index: number,
  elapsedMilliseconds: number,
): readonly [number, number, number] {
  const phase = ((seed >>> 0) % 997) / 997 + index * 0.173;
  const elapsed = elapsedMilliseconds / 1_000;
  return [
    phase * Math.PI * 2 + elapsed * 7.2,
    phase * Math.PI * 1.3 + elapsed * 9,
    phase * Math.PI * 0.7 + elapsed * 6.3,
  ];
}

function entryKeyV4(groupIndex: number, groupDieIndex: number): string {
  return `${String(groupIndex)}:${String(groupDieIndex)}`;
}

function validateAppearanceIdentitiesV4(
  model: PublicRenderModelV4,
  value: ThreeRollRendererReplaceOptionsV4["appearanceIdentities"],
): readonly (readonly string[])[] | undefined {
  if (value === undefined) return undefined;
  if (
    value.length !== model.groups.length ||
    value.some(
      (group, groupIndex) => group.length !== model.groups[groupIndex]?.length,
    )
  ) {
    throw new Error("Three.js V4 appearance identities do not match the model");
  }
  const flattened = value.flat();
  if (
    flattened.some((identity) => identity.length < 1 || identity.length > 512) ||
    new Set(flattened).size !== flattened.length
  ) {
    throw new Error("Three.js V4 appearance identities are invalid");
  }
  return value;
}

function validateRerolledAppearanceIdentitiesV4(
  appearanceIdentities: ThreeRollRendererReplaceOptionsV4["appearanceIdentities"],
  value: ThreeRollRendererReplaceOptionsV4["rerolledAppearanceIdentities"],
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const validIdentities = new Set(appearanceIdentities?.flat() ?? []);
  if (
    new Set(value).size !== value.length ||
    value.some((identity) => !validIdentities.has(identity))
  ) {
    throw new Error("Three.js V4 rerolled appearance identities are invalid");
  }
  return value;
}

function appearanceKeyV4(
  identities: ThreeRollRendererReplaceOptionsV4["appearanceIdentities"],
  groupIndex: number,
  groupDieIndex: number,
): string {
  return identities?.[groupIndex]?.[groupDieIndex] ??
    entryKeyV4(groupIndex, groupDieIndex);
}

function interpolateViewportV4(
  from: ThreeDiceGridViewportV4,
  to: ThreeDiceGridViewportV4,
  progress: number,
): ThreeDiceGridViewportV4 {
  const interpolate = (start: number, end: number): number =>
    Math.round(start + (end - start) * progress);
  return {
    x: interpolate(from.x, to.x),
    y: interpolate(from.y, to.y),
    width: interpolate(from.width, to.width),
    height: interpolate(from.height, to.height),
  };
}

function availableColumnsV4(container: HTMLElement): number {
  const width = Math.max(THREE_DICE_GRID_CELL_SIZE_V4, container.clientWidth);
  return Math.max(1, Math.min(10, Math.floor(width / THREE_DICE_GRID_CELL_SIZE_V4)));
}

function trayDimensionsV4(container: HTMLElement): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(THREE_DICE_GRID_CELL_SIZE_V4, container.clientWidth),
    height: Math.max(300, container.clientHeight),
  };
}

export function createThreeRollRendererV4(
  container: HTMLElement,
  callbacks: ThreeRollRendererCallbacksV4,
): ThreeRollRendererV4 {
  let renderer: WebGLRenderer | null = null;
  let drawingBufferLimits: ThreeDrawingBufferLimitsV4;
  try {
    renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    drawingBufferLimits = readThreeDrawingBufferLimitsV4(
      renderer.getContext(),
    );
  } catch (error) {
    renderer?.dispose();
    renderer?.domElement.remove();
    throw error;
  }

  const canvas = renderer.domElement;
  let renderContext: ThreeDiceGridRenderContextV4;
  let trayRenderContext: ThreeTrayRenderContextV4;
  try {
    const context = createThreeDiceGridRenderContextV4();
    let trayContext: ThreeTrayRenderContextV4 | null = null;
    try {
      trayContext = createThreeTrayRenderContextV4();
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.style.maxWidth = "100%";
      canvas.style.pointerEvents = "none";
      canvas.dataset.diceMotion = "static";
      canvas.setAttribute("role", "img");
      canvas.tabIndex = -1;
      container.replaceChildren(canvas);
      renderContext = context;
      trayRenderContext = trayContext;
    } catch (error) {
      disposeThreeDiceGridRenderContextV4(context);
      if (trayContext !== null) {
        disposeThreeTrayRenderContextV4(trayContext);
      }
      throw error;
    }
  } catch (error) {
    renderer.dispose();
    canvas.remove();
    throw error;
  }

  let resources: ThreeDiceGridResourcesV4 | null = null;
  let replacementRevision = 0;
  let animationFrame: number | null = null;
  let animationStartedAt = performance.now();
  let settling: SettleStateV4 | null = null;
  let presentation: PresentationStateV4 = null;
  let rolling = false;
  let reducedMotion = false;
  let disposed = false;
  let renderWidth = THREE_DICE_GRID_CELL_SIZE_V4;
  let renderHeight = THREE_DICE_GRID_CELL_SIZE_V4;
  let showModifierIcons = false;
  let activeModel: PublicRenderModelV4 | null = null;
  let activeOptions: ThreeRollRendererReplaceOptionsV4 | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const setCanvasSize = (width: number, height: number): void => {
    assertThreeDrawingBufferSizeV4(width, height, drawingBufferLimits);
    renderWidth = width;
    renderHeight = height;
    renderer.setSize(width, height, false);
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(height)}px`;
  };

  const stopAnimation = (): void => {
    if (animationFrame === null) return;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const render = (): void => {
    if (disposed || resources === null) return;
    if (presentation?.kind === "tray") {
      renderThreeTrayV4(
        renderer,
        resources,
        trayRenderContext,
        renderWidth,
        renderHeight,
      );
      return;
    }
    renderThreeDiceGridV4(renderer, resources, renderContext, {
      width: renderWidth,
      height: renderHeight,
      showModifierIcons,
    });
  };

  const setFinalOrientation = (): void => {
    resources?.entries.forEach(({ group }) => {
      resetTrayGroupTransformV4(group);
      group.quaternion.identity();
    });
  };

  const disposeGrid = (): void => {
    if (resources === null) return;
    disposeThreeDiceGridResourcesV4(resources);
    resources = null;
  };

  const capturePresentation = (): CapturedPresentationV4 | null => {
    if (resources === null || activeOptions === null) return null;
    const tray = presentation?.kind === "tray" ? presentation : null;
    const traySnapshots = new Map(
      tray?.physics.snapshots().map((snapshot) => [snapshot.identity, snapshot]) ??
        [],
    );
    return {
      width: tray?.width ?? renderWidth,
      height: tray?.height ?? renderHeight,
      viewports: new Map(
        resources.entries.map(({ cell, presentationViewport }) => {
          const key = appearanceKeyV4(
            activeOptions.appearanceIdentities,
            cell.groupIndex,
            cell.groupDieIndex,
          );
          const snapshot = traySnapshots.get(key);
          return [
            key,
            snapshot === undefined
              ? presentationViewport ?? cell.viewport
              : traySnapshotViewportV4(
                  trayRenderContext,
                  snapshot,
                  tray?.width ?? renderWidth,
                  tray?.height ?? renderHeight,
                ),
          ];
        }),
      ),
      rotations: new Map(
        resources.entries.map(({ cell, group }) => [
          appearanceKeyV4(
            activeOptions.appearanceIdentities,
            cell.groupIndex,
            cell.groupDieIndex,
          ),
          group.quaternion.clone(),
        ]),
      ),
    };
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    replacementRevision += 1;
    stopAnimation();
    resizeObserver?.disconnect();
    resizeObserver = null;
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    if (presentation?.kind === "tray") presentation.physics.dispose();
    presentation = null;
    disposeGrid();
    disposeThreeDiceGridRenderContextV4(renderContext);
    disposeThreeTrayRenderContextV4(trayRenderContext);
    renderer.dispose();
    canvas.remove();
  };

  const failRuntime = (error: unknown): void => {
    if (disposed) return;
    const failure = asErrorV4(error);
    dispose();
    callbacks.onUnavailable(failure);
  };

  const finishResultTransition = (
    state: ResultTransitionStateV4,
  ): void => {
    if (resources === null) return;
    if (state.transientEntryCount > 0) {
      const transientEntries = resources.entries.splice(
        -state.transientEntryCount,
      );
      transientEntries.forEach(({ group }) => group.clear());
    }
    resources.entries.forEach((entry) => {
      entry.presentationViewport = undefined;
      resetTrayGroupTransformV4(entry.group);
      entry.group.quaternion.identity();
    });
    presentation = null;
    showModifierIcons = true;
    rolling = false;
    canvas.dataset.diceMotion = "static";
    setCanvasSize(state.finalWidth, state.finalHeight);
  };

  const applyTraySnapshots = (state: TrayStateV4): void => {
    if (resources === null) return;
    resources.entries.forEach((entry, index) => {
      const identity = state.inputs[index]?.identity;
      if (identity === undefined) return;
      const snapshot = state.physics.snapshot(identity);
      if (snapshot !== undefined) applyTraySnapshotToGroupV4(entry.group, snapshot);
    });
  };

  const animate = (timestamp: number): void => {
    animationFrame = null;
    if (disposed || resources === null) return;
    try {
      if (reducedMotion) {
        rolling = false;
        settling = null;
        if (presentation?.kind === "result-transition") {
          finishResultTransition(presentation);
        } else if (presentation?.kind === "tray") {
          presentation.physics.freeze();
          applyTraySnapshots(presentation);
          updateThreeTraySmokeV4(
            trayRenderContext,
            Number.POSITIVE_INFINITY,
          );
        } else {
          setFinalOrientation();
        }
        canvas.dataset.removalSmokeCount = "0";
        canvas.dataset.diceMotion = "static";
        render();
        return;
      }

      if (presentation?.kind === "tray") {
        const state = presentation;
        const step = state.physics.step(
          timestamp,
          timestamp - state.lastFrameAt,
        );
        state.lastFrameAt = timestamp;
        applyTraySnapshots(state);
        const smokeActive = updateThreeTraySmokeV4(
          trayRenderContext,
          timestamp,
        );
        canvas.dataset.removalSmokeCount = String(
          trayRenderContext.smoke.length,
        );
        render();
        if (step.moving || smokeActive) {
          animationFrame = window.requestAnimationFrame(animate);
        } else {
          canvas.dataset.diceMotion = "static";
        }
        return;
      }

      if (presentation?.kind === "result-transition") {
        const state = presentation;
        const rawProgress =
          (timestamp - state.startedAt) / THREE_RESULT_TRANSITION_MILLISECONDS_V4;
        resources.entries.forEach((entry, index) => {
          const transition = state.entries[index];
          if (transition === undefined) return;
          const localProgress = Math.max(
            0,
            Math.min(
              1,
              (rawProgress - transition.spawnDelay) /
                (1 - transition.spawnDelay),
            ),
          );
          const eased = easedSettleProgressV4(localProgress);
          entry.presentationViewport = interpolateViewportV4(
            transition.from,
            transition.to,
            eased,
          );
          entry.group.quaternion.slerpQuaternions(
            transition.initialRotation,
            IDENTITY_QUATERNION_V4,
            eased,
          );
        });
        if (rawProgress >= 1) finishResultTransition(state);
        render();
        if (presentation !== null) {
          animationFrame = window.requestAnimationFrame(animate);
        }
        return;
      }

      if (rolling) {
        resources.entries.forEach(({ cell, group }, index) => {
          group.rotation.set(
            ...rollingRotationV4(
              cell.die.appearance.texture.seed,
              index,
              timestamp - animationStartedAt,
            ),
          );
        });
      } else if (settling !== null) {
        const progress =
          (timestamp - settling.startedAt) /
          THREE_RESULT_TRANSITION_MILLISECONDS_V4;
        const eased = easedSettleProgressV4(progress);
        resources.entries.forEach(({ group }, index) => {
          const initial = settling?.initial[index];
          if (initial !== undefined) {
            group.quaternion.slerpQuaternions(
              initial,
              IDENTITY_QUATERNION_V4,
              eased,
            );
          }
        });
        if (progress >= 1) {
          settling = null;
          canvas.dataset.diceMotion = "static";
          setFinalOrientation();
        }
      }
      render();
      if (rolling || settling !== null) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    } catch (error) {
      failRuntime(error);
    }
  };

  const startAnimation = (): void => {
    if (
      disposed ||
      resources === null ||
      reducedMotion ||
      animationFrame !== null
    ) {
      return;
    }
    animationFrame = window.requestAnimationFrame(animate);
  };

  const startSettle = (): void => {
    if (resources === null || reducedMotion) {
      settling = null;
      canvas.dataset.diceMotion = "static";
      setFinalOrientation();
      render();
      return;
    }
    settling = {
      startedAt: performance.now(),
      initial: resources.entries.map(({ group }) => group.quaternion.clone()),
    };
    canvas.dataset.diceMotion = "settling";
    startAnimation();
  };

  const startTray = (
    model: PublicRenderModelV4,
    identities: ThreeRollRendererReplaceOptionsV4["appearanceIdentities"],
    previousTray: TrayStateV4 | null,
    freezeMotion: boolean,
  ): void => {
    if (resources === null) return;
    const dimensions = trayDimensionsV4(container);
    setCanvasSize(dimensions.width, dimensions.height);
    showModifierIcons = false;
    const now = performance.now();
    const inputs = resources.entries.map(({ cell }) => ({
      identity: appearanceKeyV4(
        identities,
        cell.groupIndex,
        cell.groupDieIndex,
      ),
      descriptor: geometryDescriptorForDieV4(
        model.rendererRevision,
        cell.die,
      ),
      materialFamily: cell.die.appearance.material.family,
      motionSeed: freshMotionSeedV4(),
    }));
    const physics = previousTray?.physics ??
      createTrayPhysicsV4(inputs, now, reducedMotion);
    const removed = previousTray === null
      ? []
      : physics.reconcile(inputs, now, reducedMotion).removed;
    if (freezeMotion) physics.freeze();
    const state: TrayStateV4 = {
      kind: "tray",
      lastFrameAt: now,
      ...dimensions,
      inputs,
      physics,
    };
    presentation = state;
    configureThreeTrayCameraV4(
      trayRenderContext,
      dimensions.width,
      dimensions.height,
      physics.bounds(),
    );
    if (reducedMotion) {
      updateThreeTraySmokeV4(trayRenderContext, Number.POSITIVE_INFINITY);
    } else {
      removed.forEach((removed) => {
        addThreeTraySmokeV4(
          trayRenderContext,
          removed.position,
          removed.rotation,
          removed.handle >>> 0,
          now,
        );
      });
    }
    canvas.dataset.removalSmokeCount = String(trayRenderContext.smoke.length);
    applyTraySnapshots(state);
    const moving = physics.diagnostics().activeMotionDeadline !== null;
    canvas.dataset.diceMotion = !reducedMotion && moving
      ? "dropping"
      : "static";
    render();
    if (moving || trayRenderContext.smoke.length > 0) startAnimation();
  };

  const startResultTransition = (
    captured: CapturedPresentationV4,
    identities: ThreeRollRendererReplaceOptionsV4["appearanceIdentities"],
    rerolledIdentities: ThreeRollRendererReplaceOptionsV4["rerolledAppearanceIdentities"],
  ): void => {
    if (resources === null) return;
    const finalWidth = resources.layout.width;
    const finalHeight = resources.layout.height;
    const width = Math.max(captured.width, finalWidth);
    const height = Math.max(captured.height, finalHeight);
    setCanvasSize(width, height);
    showModifierIcons = false;
    const persistentEntryCount = resources.entries.length;
    resources.entries.forEach(({ cell, group }, index) => {
      const key = appearanceKeyV4(
        identities,
        cell.groupIndex,
        cell.groupDieIndex,
      );
      resetTrayGroupTransformV4(group);
      const rotation = captured.rotations.get(key);
      if (rotation === undefined) {
        group.rotation.set(
          ...rollingRotationV4(
            cell.die.appearance.texture.seed,
            index,
            0,
          ),
        );
      } else {
        group.quaternion.copy(rotation);
      }
    });
    const rerolled = new Set(rerolledIdentities ?? []);
    const rerolledEntries = resources.entries
      .filter(({ cell }) =>
        rerolled.has(
          appearanceKeyV4(
            identities,
            cell.groupIndex,
            cell.groupDieIndex,
          ),
        ),
      )
      .map((entry) => ({ ...entry, group: entry.group.clone(true) }));
    resources.entries.push(...rerolledEntries);
    let extraIndex = 0;
    const entries = resources.entries.map(({ cell, group }, index) => {
      const key = appearanceKeyV4(
        identities,
        cell.groupIndex,
        cell.groupDieIndex,
      );
      const existing =
        index < persistentEntryCount ? captured.viewports.get(key) : undefined;
      const to = {
        x: cell.viewport.x + (width - finalWidth) / 2,
        y: cell.viewport.y + (height - finalHeight) / 2,
        width: cell.viewport.width,
        height: cell.viewport.height,
      };
      let from: ThreeDiceGridViewportV4;
      let spawnDelay = 0;
      if (existing === undefined) {
        spawnDelay = Math.min(0.42, extraIndex * 0.045);
        extraIndex += 1;
        from = {
          x: to.x + to.width * 0.4,
          y: height + extraIndex * 24,
          width: Math.max(18, to.width * 0.18),
          height: Math.max(18, to.height * 0.18),
        };
      } else {
        from = {
          x: existing.x + (width - captured.width) / 2,
          y: existing.y + (height - captured.height) / 2,
          width: existing.width,
          height: existing.height,
        };
      }
      return {
        from,
        to,
        initialRotation:
          captured.rotations.get(key)?.clone() ?? group.quaternion.clone(),
        spawnDelay,
      };
    });
    presentation = {
      kind: "result-transition",
      startedAt: performance.now(),
      transientEntryCount: rerolledEntries.length,
      width,
      height,
      finalWidth,
      finalHeight,
      entries,
    };
    resources.entries.forEach((entry, index) => {
      entry.presentationViewport = entries[index]?.from;
    });
    canvas.dataset.diceMotion = "result-transition";
    render();
    startAnimation();
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    failRuntime(new Error("WebGL context was lost"));
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  const controller: ThreeRollRendererV4 = {
    async replaceModel(model, options): Promise<void> {
      if (disposed) throw new Error("Three.js V4 renderer is disposed");
      const appearanceIdentities = validateAppearanceIdentitiesV4(
        model,
        options.appearanceIdentities,
      );
      const rerolledAppearanceIdentities =
        validateRerolledAppearanceIdentitiesV4(
          appearanceIdentities,
          options.rerolledAppearanceIdentities,
        );
      const revision = ++replacementRevision;
      reducedMotion = options.reducedMotion;
      let next: ThreeDiceGridResourcesV4 | null = null;
      let committed = false;
      try {
        const preparation = await prepareThreeDiceGridV4(
          model,
          availableColumnsV4(container),
        );
        if (disposed || revision !== replacementRevision) return;
        next = createThreeDiceGridResourcesV4(preparation);
        if (disposed || revision !== replacementRevision) {
          disposeThreeDiceGridResourcesV4(next);
          next = null;
          return;
        }

        const capturedPresentation = options.blankFaces
          ? null
          : capturePresentation();
        const previousResources = resources;
        const previousTray = presentation?.kind === "tray" ? presentation : null;
        stopAnimation();
        settling = null;
        resources = next;
        next = null;
        committed = true;
        const nextOptions = {
          ...options,
          reducedMotion,
          appearanceIdentities,
          rerolledAppearanceIdentities,
        };
        activeModel = model;
        activeOptions = nextOptions;
        resources.entries.forEach(({ group }) => {
          const labels = group.getObjectByName("dice-v4-labels");
          if (labels !== undefined) labels.visible = !nextOptions.blankFaces;
        });
        if (previousResources !== null) {
          disposeThreeDiceGridResourcesV4(previousResources);
        }
        canvas.dataset.modelRevision = String(revision);
        canvas.dataset.diceCount = String(resources.layout.diceCount);
        canvas.setAttribute(
          "aria-label",
          nextOptions.blankFaces
            ? `${String(resources.layout.diceCount)} blank 3D dice prepared to roll`
            : `${String(resources.layout.diceCount)} numbered 3D dice results`,
        );
        rolling = rolling && nextOptions.blankFaces && !reducedMotion;
        if (nextOptions.blankFaces) {
          startTray(model, appearanceIdentities, previousTray, rolling);
          return;
        }

        previousTray?.physics.dispose();
        updateThreeTraySmokeV4(trayRenderContext, Number.POSITIVE_INFINITY);
        canvas.dataset.removalSmokeCount = "0";
        presentation = null;
        setCanvasSize(resources.layout.width, resources.layout.height);
        showModifierIcons = true;
        setFinalOrientation();
        if (
          capturedPresentation !== null &&
          nextOptions.animateResult &&
          !reducedMotion
        ) {
          startResultTransition(
            capturedPresentation,
            appearanceIdentities,
            rerolledAppearanceIdentities,
          );
        } else {
          render();
          if (nextOptions.animateResult && !reducedMotion) {
            resources.entries.forEach(({ cell, group }, index) => {
              group.rotation.set(
                ...rollingRotationV4(
                  cell.die.appearance.texture.seed,
                  index,
                  0,
                ),
              );
            });
            render();
            startSettle();
          }
        }
      } catch (error) {
        if (committed) failRuntime(error);
        else if (next !== null) disposeThreeDiceGridResourcesV4(next);
        throw error;
      }
    },
    setRolling(nextRolling, nextReducedMotion): void {
      if (disposed) return;
      const wasRolling = rolling;
      reducedMotion = nextReducedMotion;
      rolling = nextRolling && !reducedMotion;
      if (reducedMotion) {
        settling = null;
        stopAnimation();
        if (presentation?.kind === "result-transition") {
          finishResultTransition(presentation);
        } else if (presentation?.kind === "tray") {
          const now = performance.now();
          presentation.physics.reconcile(presentation.inputs, now, true);
          presentation.lastFrameAt = now;
          applyTraySnapshots(presentation);
          updateThreeTraySmokeV4(
            trayRenderContext,
            Number.POSITIVE_INFINITY,
          );
        } else {
          setFinalOrientation();
        }
        canvas.dataset.removalSmokeCount = "0";
        canvas.dataset.diceMotion = "static";
        try {
          render();
        } catch (error) {
          failRuntime(error);
        }
        return;
      }
      if (presentation?.kind === "tray") {
        if (rolling && !wasRolling) {
          presentation.physics.freeze();
          applyTraySnapshots(presentation);
          stopAnimation();
          updateThreeTraySmokeV4(
            trayRenderContext,
            Number.POSITIVE_INFINITY,
          );
          canvas.dataset.removalSmokeCount = "0";
          canvas.dataset.diceMotion = "static";
          render();
        }
        return;
      }
      if (presentation?.kind === "result-transition") return;
      if (rolling) {
        settling = null;
        canvas.dataset.diceMotion = "rolling";
        animationStartedAt = performance.now();
        startAnimation();
      } else if (wasRolling) {
        startSettle();
      }
    },
    dispose,
  };

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (disposed || resources === null) return;
      try {
        if (presentation?.kind === "result-transition") {
          finishResultTransition(presentation);
          render();
          if (
            activeModel !== null &&
            activeOptions !== null &&
            resources.layout.maximumColumns !== availableColumnsV4(container)
          ) {
            void controller
              .replaceModel(activeModel, {
                ...activeOptions,
                animateResult: false,
              })
              .catch(failRuntime);
          }
          return;
        }
        if (presentation?.kind === "tray") {
          const tray = presentation;
          const dimensions = trayDimensionsV4(container);
          if (
            dimensions.width === tray.width &&
            dimensions.height === tray.height
          ) {
            return;
          }
          configureThreeTrayCameraV4(
            trayRenderContext,
            dimensions.width,
            dimensions.height,
            tray.physics.bounds(),
          );
          setCanvasSize(dimensions.width, dimensions.height);
          tray.width = dimensions.width;
          tray.height = dimensions.height;
          applyTraySnapshots(tray);
          render();
          return;
        }
        if (
          presentation === null &&
          activeModel !== null &&
          activeOptions !== null &&
          resources.layout.maximumColumns !== availableColumnsV4(container)
        ) {
          void controller
            .replaceModel(activeModel, {
              ...activeOptions,
              animateResult: false,
            })
            .catch(failRuntime);
        }
      } catch (error) {
        failRuntime(error);
      }
    });
    resizeObserver.observe(container);
  }

  return controller;
}
