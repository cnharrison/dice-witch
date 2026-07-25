import {
  parsePublicRenderModelV4,
  type IconNameV4,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/d20-r3.json";
import { createThreeDiceGridLayoutV4 } from "./grid-layout";
import {
  THREE_MODIFIER_ICON_SIZE_V4,
  createThreeModifierIconPlacementsV4,
  createThreeModifierIconResourcesV4,
  disposeThreeModifierIconResourcesV4,
} from "./modifier-icons";

const sourceDie = parsePublicRenderModelV4(fixture).groups[0]?.[0];
if (sourceDie === undefined) throw new Error("Modifier-icon fixture is empty");

function die(icons: IconNameV4[]): RenderDieV4 {
  return { ...sourceDie, icons };
}

describe("V4 Three.js modifier-icon composition", () => {
  it("retains the legacy one/two/three-slot spacing and blank slot", () => {
    const groups = [
      [
        die(["critical-success"]),
        die(["chevronUp", "chevronDown"]),
        die(["trashcan", "blank", "unique"]),
      ],
      [die([])],
    ];
    const layout = createThreeDiceGridLayoutV4(
      groups,
      ({ icons }) => icons,
    );

    expect(THREE_MODIFIER_ICON_SIZE_V4).toBe(37);
    expect(
      createThreeModifierIconPlacementsV4(layout, "canvaskit-v4-r7"),
    ).toEqual([
      {
        icon: "critical-success",
        groupIndex: 0,
        groupDieIndex: 0,
        slotIndex: 0,
        x: 56.25,
        y: 150,
        width: 37,
        height: 37,
      },
      {
        icon: "chevronUp",
        groupIndex: 0,
        groupDieIndex: 1,
        slotIndex: 0,
        x: 189,
        y: 150,
        width: 37,
        height: 37,
      },
      {
        icon: "chevronDown",
        groupIndex: 0,
        groupDieIndex: 1,
        slotIndex: 1,
        x: 228,
        y: 150,
        width: 37,
        height: 37,
      },
      {
        icon: "trashcan",
        groupIndex: 0,
        groupDieIndex: 2,
        slotIndex: 0,
        x: 328.5,
        y: 150,
        width: 37,
        height: 37,
      },
      {
        icon: "unique",
        groupIndex: 0,
        groupDieIndex: 2,
        slotIndex: 2,
        x: 385.5,
        y: 150,
        width: 37,
        height: 37,
      },
    ]);
  });

  it("keeps blank spacing-only while retaining an icon-height row", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[die(["blank"])], [die([])]],
      ({ icons }) => icons,
    );

    expect(layout.height).toBe(337);
    expect(layout.rows.map(({ height }) => height)).toEqual([187, 150]);
    expect(
      createThreeModifierIconPlacementsV4(layout, "canvaskit-v4-r7"),
    ).toEqual([]);
    expect(() =>
      createThreeModifierIconResourcesV4(
        layout,
        { width: 660, height: 66 } as HTMLCanvasElement,
        "canvaskit-v4-r7",
      ),
    ).toThrow("Three.js V4 modifier-icon atlas is unexpected");
  });

  it("requires the exact prepared atlas for visible modifier icons", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[die(["unique"])]],
      ({ icons }) => icons,
    );

    expect(() =>
      createThreeModifierIconResourcesV4(
        layout,
        null,
        "canvaskit-v4-r7",
      ),
    ).toThrow("Three.js V4 modifier-icon atlas is missing");
    expect(() =>
      createThreeModifierIconResourcesV4(
        layout,
        { width: 64, height: 64 } as HTMLCanvasElement,
        "canvaskit-v4-r7",
      ),
    ).toThrow("Three.js V4 modifier-icon atlas dimensions are invalid");
  });

  it("uses approved 42px r8 icons with preserved legacy slot centers", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[die(["trashcan", "blank", "unique"])]],
      ({ icons }) => icons,
      undefined,
      42,
    );

    expect(layout.height).toBe(192);
    expect(
      createThreeModifierIconPlacementsV4(layout, "canvaskit-v4-r8"),
    ).toEqual([
      {
        icon: "trashcan",
        groupIndex: 0,
        groupDieIndex: 0,
        slotIndex: 0,
        x: 26,
        y: 150,
        width: 42,
        height: 42,
      },
      {
        icon: "unique",
        groupIndex: 0,
        groupDieIndex: 0,
        slotIndex: 2,
        x: 83,
        y: 150,
        width: 42,
        height: 42,
      },
    ]);
    const resources = createThreeModifierIconResourcesV4(
      layout,
      { width: 1_320, height: 132 } as HTMLCanvasElement,
      "canvaskit-v4-r8",
    );
    expect(resources?.iconCount).toBe(2);
    disposeThreeModifierIconResourcesV4(resources);
  });

  it("removes and disposes each modifier-icon GPU resource exactly once", () => {
    const layout = createThreeDiceGridLayoutV4(
      [[die(["unique"])]],
      ({ icons }) => icons,
    );
    const resources = createThreeModifierIconResourcesV4(
      layout,
      { width: 660, height: 66 } as HTMLCanvasElement,
      "canvaskit-v4-r7",
    );
    if (resources === null) {
      throw new Error("Modifier-icon resources are missing");
    }
    const parent = new Group();
    parent.add(resources.mesh);
    const geometryDispose = vi.spyOn(resources.geometry, "dispose");
    const materialDispose = vi.spyOn(resources.material, "dispose");
    const textureDispose = vi.spyOn(resources.texture, "dispose");

    disposeThreeModifierIconResourcesV4(resources);
    disposeThreeModifierIconResourcesV4(resources);

    expect(resources.disposed).toBe(true);
    expect(resources.mesh.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });
});
