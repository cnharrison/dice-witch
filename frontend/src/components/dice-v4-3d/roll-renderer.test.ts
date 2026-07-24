// @vitest-environment jsdom

import { Group, Quaternion } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rendererInstances: [] as Array<{
    domElement: HTMLCanvasElement;
    dispose: ReturnType<typeof vi.fn>;
    options: unknown;
  }>,
  prepare: vi.fn(),
  createResources: vi.fn(),
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
  smoke: [] as unknown[],
  motionSeed: 0,
  readLimits: vi.fn(),
  assertSize: vi.fn(),
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      dispose = vi.fn();
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      setClearColor = vi.fn();
      setViewport = vi.fn();
      setScissor = vi.fn();
      setScissorTest = vi.fn();
      clear = vi.fn();
      render = vi.fn();
      autoClear = true;
      getContext = vi.fn(() => ({}));

      constructor(readonly options: unknown) {
        mocks.rendererInstances.push(this);
      }
    },
  };
});

vi.mock("./grid-resources", () => ({
  prepareThreeDiceGridV4: mocks.prepare,
  createThreeDiceGridResourcesV4: mocks.createResources,
  disposeThreeDiceGridResourcesV4: mocks.disposeResources,
}));

vi.mock("./grid-render", () => ({
  createThreeDiceGridRenderContextV4: vi.fn(() => ({})),
  disposeThreeDiceGridRenderContextV4: mocks.disposeRenderContext,
  renderThreeDiceGridV4: mocks.render,
}));

vi.mock("./geometry", () => ({
  geometryDescriptorForDieV4: vi.fn(() => ({
    id: "d6-standard-r1",
    kind: "polyhedral",
  })),
}));

vi.mock("./tray-physics", () => ({
  createTrayPhysicsV4: mocks.createTrayPhysics,
  freshMotionSeedV4: vi.fn(() => {
    mocks.motionSeed += 1;
    return mocks.motionSeed;
  }),
}));

vi.mock("./tray-render", () => ({
  createThreeTrayRenderContextV4: mocks.createTrayRenderContext,
  disposeThreeTrayRenderContextV4: mocks.disposeTrayRenderContext,
  configureThreeTrayCameraV4: vi.fn(),
  renderThreeTrayV4: mocks.renderTray,
  applyTraySnapshotToGroupV4: vi.fn((group, snapshot) => {
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
  }),
  resetTrayGroupTransformV4: vi.fn((group) => {
    group.position.set(0, 0, 0);
    group.scale.setScalar(1);
  }),
  traySnapshotViewportV4: vi.fn((_context, snapshot) => ({
    x: Math.round(snapshot.position.x * 10),
    y: Math.round(snapshot.position.y * 10),
    width: 72,
    height: 72,
  })),
  addThreeTraySmokeV4: vi.fn((context) => {
    context.smoke.push({});
  }),
  updateThreeTraySmokeV4: vi.fn((context, now) => {
    if (now === Number.POSITIVE_INFINITY) context.smoke.length = 0;
    return context.smoke.length > 0;
  }),
}));

vi.mock("./webgl-capabilities", () => ({
  readThreeDrawingBufferLimitsV4: mocks.readLimits,
  assertThreeDrawingBufferSizeV4: mocks.assertSize,
}));

import {
  THREE_RESULT_TRANSITION_MILLISECONDS_V4,
  createThreeRollRendererV4,
} from "./roll-renderer";

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

function resources(
  seed: number,
  count = 1,
  recycledIndexes: readonly number[] = [],
) {
  const entries = Array.from({ length: count }, (_, index) => {
    const group = new Group();
    const labels = new Group();
    labels.name = "dice-v4-labels";
    group.add(labels);
    return {
      cell: {
        groupIndex: 0,
        groupDieIndex: index,
        die: {
          appearance: {
            material: { family: "classic" },
            texture: { seed: seed + index },
          },
          icons: recycledIndexes.includes(index) ? ["recycle"] : [],
        },
        viewport: { x: index * 150, y: 0, width: 150, height: 150 },
      },
      group,
    };
  });
  return {
    layout: {
      width: count * 150,
      height: 150,
      diceCount: count,
      maximumColumns: Math.min(10, count),
    },
    entries,
    assets: [],
    lighting: [],
    modifierIcons: null,
  };
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
    .mockImplementation(() => ({ smoke: mocks.smoke }));
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
    const renderer = createThreeRollRendererV4(container, { onUnavailable });
    const model = {} as Parameters<typeof renderer.replaceModel>[0];

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
    const renderer = createThreeRollRendererV4(container, { onUnavailable });
    const model = {} as Parameters<typeof renderer.replaceModel>[0];

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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    await renderer.replaceModel({} as Parameters<typeof renderer.replaceModel>[0], {
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });

    await renderer.replaceModel(
      { groups: [[{}, {}, {}]] } as Parameters<typeof renderer.replaceModel>[0],
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    await renderer.replaceModel(
      { groups: [[{}]] } as Parameters<typeof renderer.replaceModel>[0],
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
    let finishPreparation: ((value: unknown) => void) | undefined;
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const model = {
      groups: [[{}]],
    } as Parameters<typeof renderer.replaceModel>[0];

    await renderer.replaceModel(model, {
      animateResult: false,
      blankFaces: true,
      reducedMotion: false,
      appearanceIdentities: [["retained"]],
    });
    const replacement = renderer.replaceModel(
      { groups: [[{}, {}]] } as Parameters<typeof renderer.replaceModel>[0],
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const model = {
      groups: [[{}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];

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
      .mockImplementationOnce(() => resources(11, 3, [2]));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 450, configurable: true },
      clientHeight: { value: 360, configurable: true },
    });
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const preparedModel = {
      groups: [[{}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];
    const resultModel = {
      groups: [[{}, {}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];

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
    expect(mocks.rendererInstances[0]?.setSize).toHaveBeenLastCalledWith(
      450,
      150,
      false,
    );
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const model = {
      groups: [[{}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];
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
    const renderer = createThreeRollRendererV4(container, { onUnavailable });

    await renderer.replaceModel(
      { groups: [[{}]] } as Parameters<typeof renderer.replaceModel>[0],
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
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const initialModel = {
      groups: [[{}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];
    const expandedModel = {
      groups: [[{}, {}, {}]],
    } as Parameters<typeof renderer.replaceModel>[0];

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
    let finishPreparation: ((value: unknown) => void) | undefined;
    mocks.prepare.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreparation = resolve;
      }),
    );
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    const container = document.createElement("div");
    const renderer = createThreeRollRendererV4(container, {
      onUnavailable: vi.fn(),
    });
    const model = {} as Parameters<typeof renderer.replaceModel>[0];

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
      createThreeRollRendererV4(document.createElement("div"), {
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
      createThreeRollRendererV4(document.createElement("div"), {
        onUnavailable: vi.fn(),
      }),
    ).toThrow(failure);
    expect(mocks.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.rendererInstances[0]?.domElement.isConnected).toBe(false);
  });
});
