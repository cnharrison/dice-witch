// @vitest-environment jsdom

import {
  D6_STANDARD_GEOMETRY_V4,
  parsePublicRenderModelV4,
} from "@dice-witch/dice-v4-model";
import {
  Group,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/d6-r3.json";
import { createThreeDiceGridLayoutV4 } from "./grid-layout";
import { createThreeDiceGridRenderContextV4 } from "./grid-render";
import type { ThreeLightingResourcesV4 } from "./lighting";
import {
  THREE_RESULT_TRANSITION_MILLISECONDS_V4,
  createThreeRollRendererWithDependenciesV4,
  type ThreeRollRenderDriverV4,
  type ThreeRollRendererCallbacksV4,
  type ThreeRollRendererDependenciesV4,
} from "./roll-renderer";
import {
  createThreeTrayRenderContextV4,
  type ThreeTraySmokeV4,
} from "./tray-render";

const sourceModel = parsePublicRenderModelV4(fixture);
const sourceDie = sourceModel.groups[0]?.[0];
if (sourceDie === undefined) throw new Error("Roll-renderer fixture is empty");

// SAFETY: These empty test registries are populated only by the typed factories below.
const mocks = {
  rendererInstances: [] as Array<ThreeRollRenderDriverV4 & {
    dispose: ReturnType<typeof vi.fn>;
    options: unknown;
    setSize: ReturnType<typeof vi.fn>;
  }>,
  prepare: vi.fn<
    (model: typeof sourceModel, maximumColumns: number) => Promise<TestPreparation>
  >(),
  createResources: vi.fn<
    (preparation: TestPreparation) => ReturnType<typeof resources>
  >(),
  disposeResources: vi.fn(),
  render: vi.fn(),
  renderTray: vi.fn(),
  disposeRenderContext: vi.fn(),
  disposeTrayRenderContext: vi.fn(),
  createTrayRenderContext: vi.fn(),
  createTrayPhysics: vi.fn(),
  trayPhysicsInstances: [] as Array<{
    reconcile: ReturnType<typeof vi.fn>;
    step: ReturnType<typeof vi.fn>;
    energize: ReturnType<typeof vi.fn>;
    freeze: ReturnType<typeof vi.fn>;
    snapshots: ReturnType<typeof vi.fn>;
    snapshot: ReturnType<typeof vi.fn>;
    bounds: ReturnType<typeof vi.fn>;
    diagnostics: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  smoke: [] as ThreeTraySmokeV4[],
  motionSeed: 0,
  readLimits: vi.fn(),
  assertSize: vi.fn(),
};

type FakeTrayInput = {
  identity: string;
  descriptor: { id: string };
};

function fakeTrayPhysics(initialInputs: readonly FakeTrayInput[], reduced: boolean) {
  let inputs = [...initialInputs];
  let motionActive = !reduced;
  const handleByIdentity = new Map(
    inputs.map(({ identity }, index) => [identity, index + 1]),
  );
  const snapshotFor = (identity: string) => {
    const index = inputs.findIndex((input) => input.identity === identity);
    if (index < 0) return undefined;
    return {
      identity,
      handle: handleByIdentity.get(identity) ?? index + 1,
      descriptorId: inputs[index]?.descriptor.id ?? "d6-standard-r1",
      position: { x: 3 + index * 8, y: 4 + index * 3, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      renderScale: 0.4,
      sleeping: reduced,
    };
  };
  const instance = {
    reconcile: vi.fn((
      nextInputs: readonly FakeTrayInput[],
      _currentTime: number,
      staticLayout: boolean,
    ) => {
      const previous = new Set(inputs.map(({ identity }) => identity));
      const next = new Set(nextInputs.map(({ identity }) => identity));
      const removed = inputs
        .filter(({ identity }) => !next.has(identity))
        .flatMap(({ identity }) => {
          const snapshot = snapshotFor(identity);
          return snapshot === undefined ? [] : [snapshot];
        });
      nextInputs.forEach(({ identity }) => {
        if (!handleByIdentity.has(identity)) {
          handleByIdentity.set(identity, handleByIdentity.size + 1);
        }
      });
      inputs = [...nextInputs];
      const added = inputs
        .filter(({ identity }) => !previous.has(identity))
        .map(({ identity }) => identity);
      if (staticLayout) motionActive = false;
      else if (added.length > 0) motionActive = true;
      return {
        added,
        retained: inputs
          .filter(({ identity }) => previous.has(identity))
          .map(({ identity }) => identity),
        removed,
      };
    }),
    step: vi.fn(() => ({
      moving: false,
      fixedSteps: 1,
      stoppedByDeadline: false,
    })),
    energize: vi.fn(),
    freeze: vi.fn(() => {
      motionActive = false;
    }),
    snapshots: vi.fn(() =>
      inputs.flatMap(({ identity }) => {
        const snapshot = snapshotFor(identity);
        return snapshot === undefined ? [] : [snapshot];
      }),
    ),
    snapshot: vi.fn(snapshotFor),
    bounds: vi.fn(() => ({ halfWidth: 3, halfDepth: 2 })),
    diagnostics: vi.fn(() => ({
      rigidBodyCount: inputs.length,
      colliderCount: inputs.length + 5,
      solverIterations: 4,
      activeMotionDeadline: motionActive ? 2_000 : null,
    })),
    dispose: vi.fn(),
  };
  mocks.trayPhysicsInstances.push(instance);
  return instance;
}

function renderModel(count = 1) {
  return {
    ...sourceModel,
    groups: [Array.from({ length: count }, () => sourceDie)],
  };
}

type TestPreparation = { layout: { width: number; height: number } };

function resources(seed: number, count = 1) {
  const dice = Array.from({ length: count }, (_, index) => ({
    ...sourceDie,
    icons: [],
    appearance: {
      ...sourceDie.appearance,
      texture: { ...sourceDie.appearance.texture, seed: seed + index },
    },
  }));
  const layout = createThreeDiceGridLayoutV4(
    [dice],
    ({ icons }) => icons,
    Math.min(10, count),
  );
  const entries = layout.rows.flatMap(({ cells }) =>
    cells.map((cell) => {
      const group = new Group();
      const labels = new Group();
      labels.name = "dice-v4-labels";
      group.add(labels);
      const lighting = {
        group: new Group(),
        directionalLights: [],
        policy: {
          ambientIntensity: 1,
          hemisphereIntensity: 1,
          keyIntensity: 1,
          rimIntensity: 0,
          keyPosition: [0, 6, 5],
          rimPosition: [0, 1.5, -5],
        },
      } satisfies ThreeLightingResourcesV4;
      return {
        cell,
        group,
        camera: new OrthographicCamera(),
        lighting,
      };
    }),
  );
  return {
    layout,
    entries,
    assets: [],
    lighting: entries.map(({ lighting }) => lighting),
    modifierIcons: null,
  };
}

const dependencies = {
  createRenderDriver(options) {
    const domElement = document.createElement("canvas");
    const dispose = vi.fn();
    const setSize = vi.fn();
    const driver = {
      domElement,
      options,
      dispose,
      setSize,
      assertDrawingBufferSize(width: number, height: number) {
        mocks.assertSize(width, height);
      },
      renderGrid(...args: Parameters<ThreeRollRenderDriverV4["renderGrid"]>) {
        mocks.render(...args);
      },
      renderTray(...args: Parameters<ThreeRollRenderDriverV4["renderTray"]>) {
        mocks.renderTray(...args);
      },
    };
    mocks.rendererInstances.push(driver);
    try {
      mocks.readLimits();
      return driver;
    } catch (error) {
      dispose();
      domElement.remove();
      throw error;
    }
  },
  grid: {
    prepare: mocks.prepare,
    create: mocks.createResources,
    dispose: mocks.disposeResources,
  },
  gridContext: {
    create: createThreeDiceGridRenderContextV4,
    dispose: mocks.disposeRenderContext,
  },
  trayPhysics: {
    create: mocks.createTrayPhysics,
    freshMotionSeed() {
      mocks.motionSeed += 1;
      return mocks.motionSeed;
    },
    geometryDescriptor: vi.fn(() => D6_STANDARD_GEOMETRY_V4),
  },
  trayRender: {
    createContext: mocks.createTrayRenderContext,
    disposeContext: mocks.disposeTrayRenderContext,
    configureCamera: vi.fn(),
    applySnapshot(group, snapshot) {
      group.position.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z,
      );
      group.quaternion.set(
        snapshot.rotation.x,
        snapshot.rotation.y,
        snapshot.rotation.z,
        snapshot.rotation.w,
      );
      group.scale.setScalar(snapshot.renderScale);
    },
    resetGroupTransform(group) {
      group.position.set(0, 0, 0);
      group.scale.setScalar(1);
    },
    snapshotViewport(_context, snapshot) {
      return {
        x: Math.round(snapshot.position.x * 10),
        y: Math.round(snapshot.position.y * 10),
        width: 72,
        height: 72,
      };
    },
    addSmoke(context) {
      context.smoke.push({
        group: new Group(),
        material: new MeshBasicMaterial(),
        startedAt: 0,
        originY: 0,
      });
    },
    updateSmoke(context, now) {
      if (now === Number.POSITIVE_INFINITY) context.smoke.length = 0;
      return context.smoke.length > 0;
    },
  },
} satisfies ThreeRollRendererDependenciesV4<TestPreparation>;

function createTestRenderer(
  container: HTMLElement,
  callbacks: ThreeRollRendererCallbacksV4,
) {
  return createThreeRollRendererWithDependenciesV4(
    container,
    callbacks,
    dependencies,
  );
}

beforeEach(() => {
  mocks.rendererInstances.length = 0;
  mocks.trayPhysicsInstances.length = 0;
  mocks.smoke.length = 0;
  mocks.motionSeed = 0;
  mocks.createTrayPhysics
    .mockReset()
    .mockImplementation((inputs, _now, reduced) =>
      fakeTrayPhysics(inputs, reduced),
    );
  mocks.prepare
    .mockReset()
    .mockResolvedValue({ layout: { width: 150, height: 150 } });
  mocks.createResources
    .mockReset()
    .mockImplementationOnce(() => resources(1))
    .mockImplementationOnce(() => resources(2));
  mocks.disposeResources.mockReset();
  mocks.render.mockReset();
  mocks.renderTray.mockReset();
  mocks.disposeRenderContext.mockReset();
  mocks.disposeTrayRenderContext.mockReset();
  mocks.createTrayRenderContext
    .mockReset()
    .mockImplementation(() => {
      const context = createThreeTrayRenderContextV4();
      context.smoke = mocks.smoke;
      return context;
    });
  mocks.readLimits.mockReset().mockReturnValue({
    maxViewportWidth: 8_192,
    maxViewportHeight: 8_192,
    maxRenderbufferSize: 8_192,
  });
  mocks.assertSize.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Three.js V4 roll renderer lifecycle", () => {
  it("uses the approved compact result handoff", () => {
    expect(THREE_RESULT_TRANSITION_MILLISECONDS_V4).toBe(400);
  });
  it("commits a prepared replacement before disposing the previous model and cleans up on context loss", async () => {
    const container = document.createElement("div");
    const onUnavailable = vi.fn();
    const renderer = createTestRenderer(container, { onUnavailable });
    const model = renderModel();

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: false,
      reducedMotion: true,
    });
    const first = mocks.createResources.mock.results[0]?.value;
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(mocks.rendererInstances[0]?.options).toMatchObject({ alpha: true });

    const replacement = renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: false,
      reducedMotion: true,
    });
    expect(mocks.disposeResources).not.toHaveBeenCalledWith(first);
    await replacement;
    expect(mocks.disposeResources).toHaveBeenCalledWith(first);

    const second = mocks.createResources.mock.results[1]?.value;
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.style.pointerEvents).toBe("none");
    expect(canvas?.dataset).toMatchObject({
      diceCount: "1",
      diceMotion: "static",
      modelRevision: "2",
    });
    canvas?.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    expect(onUnavailable).toHaveBeenCalledWith(
      new Error("WebGL context was lost"),
    );
    expect(mocks.disposeResources).toHaveBeenCalledWith(second);
    expect(mocks.disposeRenderContext).toHaveBeenCalledTimes(1);
    expect(mocks.disposeTrayRenderContext).toHaveBeenCalledTimes(1);
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();

    renderer.dispose();
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("fails closed when replacement setup throws after commit", async () => {
    const container = document.createElement("div");
    const onUnavailable = vi.fn();
    const renderer = createTestRenderer(container, { onUnavailable });
    const model = renderModel();

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: false,
      reducedMotion: true,
    });
    const failure = new Error("Replacement render failed");
    mocks.render.mockImplementationOnce(() => {
      throw failure;
    });

    await expect(
      renderer.replaceModel(model, {
        animateResult: false,
        blankFaces: false,
        reducedMotion: true,
      }),
    ).rejects.toThrow(failure);

    expect(onUnavailable).toHaveBeenCalledWith(failure);
    expect(mocks.disposeResources).toHaveBeenCalledWith(
      mocks.createResources.mock.results[1]?.value,
    );
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("hides every label in a blank-face tray", async () => {
    const container = document.createElement("div");
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    await renderer.replaceModel(renderModel(), {
      animateResult: false,
      blankFaces: true,
      reducedMotion: true,
    });

    const prepared = mocks.createResources.mock.results[0]?.value;
    expect(prepared.entries[0].group.getObjectByName("dice-v4-labels").visible).toBe(false);
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe(
      "1 blank 3D dice prepared to roll",
    );
    renderer.dispose();
  });

  it("moves an active tray into a bounded static layout when reduced motion turns on", async () => {
    const requestAnimationFrame = vi.fn(() => 1);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    mocks.createResources.mockReset().mockImplementationOnce(() => resources(31, 3));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 450, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await renderer.replaceModel(
      renderModel(3),
      {
        animateResult: false,
        blankFaces: true,
        reducedMotion: false,
        appearanceIdentities: [["die-0", "die-1", "die-2"]],
      },
    );
    const active = mocks.createResources.mock.results[0]?.value;
    renderer.setRolling(false, true);

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(
      mocks.trayPhysicsInstances[0]?.reconcile.mock.calls.at(-1)?.[2],
    ).toBe(true);
    expect(
      active.entries.every(({ group }) =>
        group.scale.x === 0.4 && group.position.y >= 4
      ),
    ).toBe(true);
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    renderer.dispose();
  });

  it("interrupts selection physics when a roll starts", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources.mockReset().mockImplementationOnce(() => resources(35));
    const container = document.createElement("div");
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await renderer.replaceModel(
      renderModel(),
      {
        animateResult: false,
        blankFaces: true,
        reducedMotion: false,
        appearanceIdentities: [["die"]],
      },
    );

    renderer.setRolling(true, false);
    expect(mocks.trayPhysicsInstances[0]?.freeze).toHaveBeenCalledTimes(1);
    expect(mocks.trayPhysicsInstances[0]?.energize).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    renderer.dispose();
  });

  it("keeps a late blank-face replacement frozen after Roll starts", async () => {
    let finishPreparation:
      | ((value: { layout: { width: number; height: number } }) => void)
      | undefined;
    mocks.prepare
      .mockReset()
      .mockResolvedValueOnce({ layout: { width: 150, height: 150 } })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishPreparation = resolve;
        }),
      );
    mocks.createResources
      .mockReset()
      .mockImplementationOnce(() => resources(37))
      .mockImplementationOnce(() => resources(38, 2));
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const container = document.createElement("div");
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const model = renderModel();

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: [["retained"]],
    });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const replacement = renderer.replaceModel(
      renderModel(2),
      {
        animateResult: false,
        blankFaces: true,
        reducedMotion: false,
        appearanceIdentities: [["retained", "added"]],
      },
    );
    renderer.setRolling(true, false);
    finishPreparation?.({ layout: { width: 300, height: 150 } });
    await replacement;

    expect(mocks.createTrayPhysics).toHaveBeenCalledTimes(1);
    expect(mocks.trayPhysicsInstances[0]?.freeze).toHaveBeenCalledTimes(2);
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    renderer.dispose();
  });

  it("keeps one identity-keyed world while adding and removing prepared dice", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources
      .mockReset()
      .mockImplementationOnce(() => resources(41, 2))
      .mockImplementationOnce(() => resources(51, 2));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 450, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const model = renderModel(2);

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: [["retained", "removed"]],
    });
    const retainedHandle = mocks.trayPhysicsInstances[0]?.snapshot("retained")
      ?.handle;
    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: [["retained", "added"]],
    });

    expect(mocks.createTrayPhysics).toHaveBeenCalledTimes(1);
    expect(mocks.trayPhysicsInstances[0]?.reconcile).toHaveBeenCalledTimes(1);
    expect(
      mocks.trayPhysicsInstances[0]?.snapshot("retained")?.handle,
    ).toBe(retainedHandle);
    expect(container.querySelector("canvas")?.dataset.removalSmokeCount).toBe(
      "1",
    );
    renderer.dispose();
    expect(mocks.trayPhysicsInstances[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("moves prepared dice into results and spawns exploded and rerolled extras during the transition", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources
      .mockReset()
      .mockImplementationOnce(() => resources(11, 2))
      .mockImplementationOnce(() => resources(11, 3));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 450, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const preparedModel = renderModel(2);
    const resultModel = renderModel(3);

    await renderer.replaceModel(preparedModel, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: [["original-0", "original-1"]],
    });
    const prepared = mocks.createResources.mock.results[0]?.value;
    await renderer.replaceModel(resultModel, {
      animateResult: true,
      blankFaces: false,
      reducedMotion: false,
      appearanceIdentities: [[
        "original-0",
        "original-0:generated:0",
        "original-1",
      ]],
      rerolledAppearanceIdentities: ["original-1"],
    });

    const result = mocks.createResources.mock.results[1]?.value;
    expect(result.entries[0].group).not.toBe(prepared.entries[0].group);
    expect(result.entries[0].presentationViewport).toEqual({
      x: 30,
      y: 40,
      width: 72,
      height: 72,
    });
    expect(result.entries[1].presentationViewport.y).toBeGreaterThanOrEqual(360);
    expect(result.entries[2].group).not.toBe(prepared.entries[1].group);
    expect(result.entries[2].presentationViewport).toEqual({
      x: 110,
      y: 70,
      width: 72,
      height: 72,
    });
    expect(result.entries).toHaveLength(4);
    expect(result.entries[3].group).not.toBe(result.entries[2].group);
    expect(result.entries[3].presentationViewport.y).toBeGreaterThanOrEqual(360);
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "result-transition",
    );
    expect(mocks.trayPhysicsInstances[0]?.dispose).toHaveBeenCalledTimes(1);

    renderer.setRolling(false, true);
    expect(result.entries).toHaveLength(3);
    expect(
      result.entries.every(({ presentationViewport }) =>
        presentationViewport === undefined,
      ),
    ).toBe(true);
    expect(
      result.entries.every(({ group }) =>
        group.quaternion.equals(new Quaternion()),
      ),
    ).toBe(true);
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    expect(mocks.rendererInstances[0]?.setSize).toHaveBeenLastCalledWith(450, 150);
    renderer.dispose();
  });

  it("finishes and relayouts a result transition when its container resizes", async () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources
      .mockReset()
      .mockImplementationOnce(() => resources(61, 2))
      .mockImplementationOnce(() => resources(62, 2))
      .mockImplementationOnce(() => {
        const relayout = resources(63, 2);
        relayout.layout.maximumColumns = 1;
        return relayout;
      });
    let width = 300;
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { get: () => width, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const model = renderModel(2);
    const identities = [["first", "second"]] as const;

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: identities,
    });
    await renderer.replaceModel(model, {
      animateResult: true,
      blankFaces: false,
      reducedMotion: false,
      appearanceIdentities: identities,
    });
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "result-transition",
    );

    width = 150;
    resize?.();
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    expect(mocks.prepare).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(mocks.createResources).toHaveBeenCalledTimes(3));
    renderer.dispose();
  });

  it("fails closed when a tray resize exceeds renderer limits", async () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources.mockReset().mockImplementationOnce(() => resources(65));
    let width = 150;
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { get: () => width, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const onUnavailable = vi.fn();
    const renderer = createTestRenderer(container, { onUnavailable });

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await renderer.replaceModel(
      renderModel(),
      {
        animateResult: false,
        blankFaces: true,
        reducedMotion: false,
        appearanceIdentities: [["die"]],
      },
    );
    const failure = new Error("Drawing buffer is too large");
    mocks.assertSize.mockImplementationOnce(() => {
      throw failure;
    });
    width = 300;
    resize?.();

    expect(onUnavailable).toHaveBeenCalledWith(failure);
    expect(mocks.trayPhysicsInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("reconciles a result model that gains generated identities without relaunching existing dice", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.createResources
      .mockReset()
      .mockImplementationOnce(() => resources(21, 2))
      .mockImplementationOnce(() => resources(21, 3));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 450, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const initialModel = renderModel(2);
    const expandedModel = renderModel(3);

    await renderer.replaceModel(initialModel, {
      animateResult: false,
      blankFaces: false,
      reducedMotion: false,
      appearanceIdentities: [["original-0", "original-1"]],
    });
    const initial = mocks.createResources.mock.results[0]?.value;
    await renderer.replaceModel(expandedModel, {
      animateResult: true,
      blankFaces: false,
      reducedMotion: false,
      appearanceIdentities: [[
        "original-0",
        "original-0:generated:0",
        "original-1",
      ]],
      rerolledAppearanceIdentities: [],
    });

    const expanded = mocks.createResources.mock.results[1]?.value;
    expect(expanded.entries[0].group).not.toBe(initial.entries[0].group);
    expect(expanded.entries[0].presentationViewport).toEqual({
      ...initial.entries[0].cell.viewport,
      x: initial.entries[0].cell.viewport.x + 75,
    });
    expect(expanded.entries[1].presentationViewport.y).toBeGreaterThanOrEqual(
      expanded.layout.height,
    );
    expect(expanded.entries[2].group).not.toBe(initial.entries[1].group);
    expect(expanded.entries[2].presentationViewport).toEqual({
      ...initial.entries[1].cell.viewport,
      x: initial.entries[1].cell.viewport.x + 75,
    });
    renderer.dispose();
  });

  it("retains a mid-preparation reduced-motion change", async () => {
    let finishPreparation:
      | ((value: { layout: { width: number; height: number } }) => void)
      | undefined;
    mocks.prepare.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreparation = resolve;
      }),
    );
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    const container = document.createElement("div");
    const renderer = createTestRenderer(container, {
      onUnavailable: vi.fn(),
    });
    const model = renderModel();

    const replacement = renderer.replaceModel(model, {
      animateResult: true,
      blankFaces: false,
      reducedMotion: false,
    });
    renderer.setRolling(false, true);
    finishPreparation?.({ layout: { width: 150, height: 150 } });
    await replacement;

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")?.dataset.diceMotion).toBe(
      "static",
    );
    renderer.dispose();
  });

  it("disposes the grid context when shared tray setup fails", () => {
    const failure = new Error("Shared tray context failed");
    mocks.createTrayRenderContext.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() =>
      createTestRenderer(document.createElement("div"), {
        onUnavailable: vi.fn(),
      }),
    ).toThrow(failure);
    expect(mocks.disposeRenderContext).toHaveBeenCalledTimes(1);
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a created renderer when capability discovery fails", () => {
    const failure = new Error(
      "Three.js V4 WebGL drawing-buffer limits are invalid",
    );
    mocks.readLimits.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() =>
      createTestRenderer(document.createElement("div"), {
        onUnavailable: vi.fn(),
      }),
    ).toThrow(failure);
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.rendererInstances[0]?.domElement.isConnected).toBe(false);
  });
});
