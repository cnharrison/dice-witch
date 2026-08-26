import type { PublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import * as z from "zod";
import {
  Quaternion,
  WebGLRenderer,
  type WebGLRendererParameters,
} from "three";
import {
  createThreeDiceGridResourcesV4,
  disposeThreeDiceGridResourcesV4,
  prepareThreeDiceGridV4,
  type PreparedThreeDiceGridV4,
  type ThreeDiceGridResourcesV4,
} from "./grid-resources";
import {
  createThreeDiceGridRenderContextV4,
  disposeThreeDiceGridRenderContextV4,
  renderThreeDiceGridV4,
  type ThreeDiceGridRenderContextV4,
  type ThreeDiceGridRenderOptionsV4,
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

export type ThreeRollRenderDriverV4 = {
  domElement: HTMLCanvasElement;
  assertDrawingBufferSize(width: number, height: number): void;
  setSize(width: number, height: number): void;
  renderGrid(
    resources: ThreeDiceGridResourcesV4,
    context: ThreeDiceGridRenderContextV4,
    options: ThreeDiceGridRenderOptionsV4,
  ): void;
  renderTray(
    resources: ThreeDiceGridResourcesV4,
    context: ThreeTrayRenderContextV4,
    width: number,
    height: number,
  ): void;
  dispose(): void;
};

export type ThreeRollRendererDependenciesV4<Preparation> = {
  createRenderDriver(options: WebGLRendererParameters): ThreeRollRenderDriverV4;
  grid: {
    prepare(
      model: PublicRenderModelV4,
      maximumColumns: number,
    ): Promise<Preparation>;
    create(preparation: Preparation): ThreeDiceGridResourcesV4;
    dispose(resources: ThreeDiceGridResourcesV4): void;
  };
  gridContext: {
    create(): ThreeDiceGridRenderContextV4;
    dispose(context: ThreeDiceGridRenderContextV4): void;
  };
  trayPhysics: {
    create: typeof createTrayPhysicsV4;
    freshMotionSeed: typeof freshMotionSeedV4;
    geometryDescriptor: typeof geometryDescriptorForDieV4;
  };
  trayRender: {
    createContext: typeof createThreeTrayRenderContextV4;
    disposeContext: typeof disposeThreeTrayRenderContextV4;
    configureCamera: typeof configureThreeTrayCameraV4;
    applySnapshot: typeof applyTraySnapshotToGroupV4;
    resetGroupTransform: typeof resetTrayGroupTransformV4;
    snapshotViewport: typeof traySnapshotViewportV4;
    addSmoke: typeof addThreeTraySmokeV4;
    updateSmoke: typeof updateThreeTraySmokeV4;
  };
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

const rendererFailureSchema = z.unknown();
type RendererFailure = z.input<typeof rendererFailureSchema>;

function asErrorV4(error: RendererFailure): Error {
  const parsed = z.instanceof(Error).safeParse(error);
  return parsed.success
    ? parsed.data
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

function trayDimensionsV4(container: HTMLElement) {
  return {
    width: Math.max(THREE_DICE_GRID_CELL_SIZE_V4, container.clientWidth),
    height: Math.max(300, container.clientHeight),
  };
}

export function createThreeRollRendererWithDependenciesV4<Preparation>(
  container: HTMLElement,
  callbacks: ThreeRollRendererCallbacksV4,
  dependencies: ThreeRollRendererDependenciesV4<Preparation>,
): ThreeRollRendererV4 {
  const { grid, gridContext, trayPhysics, trayRender } = dependencies;
  const renderer = dependencies.createRenderDriver({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  const canvas = renderer.domElement;
  let renderContext: ThreeDiceGridRenderContextV4;
  let trayRenderContext: ThreeTrayRenderContextV4;
  try {
    const context = gridContext.create();
    let trayContext: ThreeTrayRenderContextV4 | null = null;
    try {
      trayContext = trayRender.createContext();
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
      gridContext.dispose(context);
      if (trayContext !== null) {
        trayRender.disposeContext(trayContext);
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
    renderer.assertDrawingBufferSize(width, height);
    renderWidth = width;
    renderHeight = height;
    renderer.setSize(width, height);
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
      renderer.renderTray(
        resources,
        trayRenderContext,
        renderWidth,
        renderHeight,
      );
      return;
    }
    renderer.renderGrid(resources, renderContext, {
      width: renderWidth,
      height: renderHeight,
      showModifierIcons,
    });
  };

  const setFinalOrientation = (): void => {
    resources?.entries.forEach(({ group }) => {
      trayRender.resetGroupTransform(group);
      group.quaternion.identity();
    });
  };

  const disposeGrid = (): void => {
    if (resources === null) return;
    grid.dispose(resources);
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
              : trayRender.snapshotViewport(
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
    gridContext.dispose(renderContext);
    trayRender.disposeContext(trayRenderContext);
    renderer.dispose();
    canvas.remove();
  };

  const failRuntime = (error: RendererFailure): void => {
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
      trayRender.resetGroupTransform(entry.group);
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
      if (snapshot !== undefined) trayRender.applySnapshot(entry.group, snapshot);
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
          trayRender.updateSmoke(
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
        const smokeActive = trayRender.updateSmoke(
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
      descriptor: trayPhysics.geometryDescriptor(
        model.rendererRevision,
        cell.die,
      ),
      materialFamily: cell.die.appearance.material.family,
      motionSeed: trayPhysics.freshMotionSeed(),
    }));
    const physics = previousTray?.physics ??
      trayPhysics.create(inputs, now, reducedMotion);
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
    trayRender.configureCamera(
      trayRenderContext,
      dimensions.width,
      dimensions.height,
      physics.bounds(),
    );
    if (reducedMotion) {
      trayRender.updateSmoke(trayRenderContext, Number.POSITIVE_INFINITY);
    } else {
      removed.forEach((removed) => {
        trayRender.addSmoke(
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
      trayRender.resetGroupTransform(group);
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
        const preparation = await grid.prepare(
          model,
          availableColumnsV4(container),
        );
        if (disposed || revision !== replacementRevision) return;
        next = grid.create(preparation);
        if (disposed || revision !== replacementRevision) {
          grid.dispose(next);
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
          grid.dispose(previousResources);
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
        trayRender.updateSmoke(trayRenderContext, Number.POSITIVE_INFINITY);
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
        else if (next !== null) grid.dispose(next);
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
          trayRender.updateSmoke(
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
          trayRender.updateSmoke(
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

  if (z.object({ ResizeObserver: z.function() }).safeParse(globalThis).success) {
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
          trayRender.configureCamera(
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

function createProductionRenderDriverV4(
  options: WebGLRendererParameters,
): ThreeRollRenderDriverV4 {
  let renderer: WebGLRenderer | null = null;
  try {
    renderer = new WebGLRenderer(options);
    renderer.setPixelRatio(1);
    const drawingBufferLimits = readThreeDrawingBufferLimitsV4(
      renderer.getContext(),
    );
    return {
      domElement: renderer.domElement,
      assertDrawingBufferSize(width, height) {
        assertThreeDrawingBufferSizeV4(width, height, drawingBufferLimits);
      },
      setSize(width, height) {
        renderer.setSize(width, height, false);
      },
      renderGrid(resources, context, renderOptions) {
        renderThreeDiceGridV4(renderer, resources, context, renderOptions);
      },
      renderTray(resources, context, width, height) {
        renderThreeTrayV4(renderer, resources, context, width, height);
      },
      dispose() {
        renderer.dispose();
      },
    };
  } catch (error) {
    renderer?.dispose();
    renderer?.domElement.remove();
    throw error;
  }
}

const productionThreeRollRendererDependenciesV4 = {
  createRenderDriver: createProductionRenderDriverV4,
  grid: {
    prepare: prepareThreeDiceGridV4,
    create: createThreeDiceGridResourcesV4,
    dispose: disposeThreeDiceGridResourcesV4,
  },
  gridContext: {
    create: createThreeDiceGridRenderContextV4,
    dispose: disposeThreeDiceGridRenderContextV4,
  },
  trayPhysics: {
    create: createTrayPhysicsV4,
    freshMotionSeed: freshMotionSeedV4,
    geometryDescriptor: geometryDescriptorForDieV4,
  },
  trayRender: {
    createContext: createThreeTrayRenderContextV4,
    disposeContext: disposeThreeTrayRenderContextV4,
    configureCamera: configureThreeTrayCameraV4,
    applySnapshot: applyTraySnapshotToGroupV4,
    resetGroupTransform: resetTrayGroupTransformV4,
    snapshotViewport: traySnapshotViewportV4,
    addSmoke: addThreeTraySmokeV4,
    updateSmoke: updateThreeTraySmokeV4,
  },
} satisfies ThreeRollRendererDependenciesV4<PreparedThreeDiceGridV4>;

export function createThreeRollRendererV4(
  container: HTMLElement,
  callbacks: ThreeRollRendererCallbacksV4,
): ThreeRollRendererV4 {
  return createThreeRollRendererWithDependenciesV4(
    container,
    callbacks,
    productionThreeRollRendererDependenciesV4,
  );
}
