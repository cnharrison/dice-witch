import { describe, expect, it } from "vitest";
import {
  RENDERER_REVISIONS_V4,
  RENDERER_REVISION_POLICIES_V4,
  rendererRevisionPolicyV4,
  type RendererRevisionV4,
} from "../src";

describe("V4 renderer revision policies", () => {
  it("defines one frozen, exhaustive policy for every immutable revision", () => {
    expect(Object.keys(RENDERER_REVISION_POLICIES_V4)).toEqual(
      RENDERER_REVISIONS_V4,
    );
    expect(Object.isFrozen(RENDERER_REVISION_POLICIES_V4)).toBe(true);
    for (const revision of RENDERER_REVISIONS_V4) {
      expect(Object.isFrozen(rendererRevisionPolicyV4(revision))).toBe(true);
    }
  });

  it("inherits every r7 policy in r8 except the approved icon design", () => {
    const revision7 = rendererRevisionPolicyV4("canvaskit-v4-r7");
    const revision8 = rendererRevisionPolicyV4("canvaskit-v4-r8");

    expect(revision8).toEqual({
      ...revision7,
      modifierIcons: "signal-disks-r8",
    });
    expect(revision7.modifierIcons).toBe("legacy-r1");
  });

  it("inherits every r8 policy in r9 except the compact grid layout", () => {
    const revision8 = rendererRevisionPolicyV4("canvaskit-v4-r8");
    const revision9 = rendererRevisionPolicyV4("canvaskit-v4-r9");

    expect(revision9).toEqual({
      ...revision8,
      gridLayout: "compact-r9",
    });
    expect(revision8.gridLayout).toBe("legacy");
  });

  it("inherits every r9 policy in r10 except the grouped-row layout", () => {
    const revision9 = rendererRevisionPolicyV4("canvaskit-v4-r9");
    const revision10 = rendererRevisionPolicyV4("canvaskit-v4-r10");

    expect(revision10).toEqual({
      ...revision9,
      gridLayout: "group-rows-r10",
    });
  });

  it("inherits every r10 policy in r11 except the wider grouped-row gap", () => {
    const revision10 = rendererRevisionPolicyV4("canvaskit-v4-r10");
    const revision11 = rendererRevisionPolicyV4("canvaskit-v4-r11");

    expect(revision11).toEqual({
      ...revision10,
      gridLayout: "group-rows-r11",
    });
  });

  it("inherits every r11 policy in r12 except production center spacing", () => {
    const revision11 = rendererRevisionPolicyV4("canvaskit-v4-r11");
    const revision12 = rendererRevisionPolicyV4("canvaskit-v4-r12");

    expect(revision12).toEqual({
      ...revision11,
      gridLayout: "group-rows-r12",
    });
  });

  it("inherits every r12 policy in r13 except independent row wrapping", () => {
    const revision12 = rendererRevisionPolicyV4("canvaskit-v4-r12");
    const revision13 = rendererRevisionPolicyV4("canvaskit-v4-r13");

    expect(revision13).toEqual({
      ...revision12,
      gridLayout: "group-rows-r13",
    });
  });

  it("inherits every r13 policy in r14 except balanced row wrapping", () => {
    const revision13 = rendererRevisionPolicyV4("canvaskit-v4-r13");
    const revision14 = rendererRevisionPolicyV4("canvaskit-v4-r14");

    expect(revision14).toEqual({
      ...revision13,
      gridLayout: "group-rows-r14",
    });
  });

  it("inherits every r14 policy in r15 except the d20 clearance shortfall", () => {
    const revision14 = rendererRevisionPolicyV4("canvaskit-v4-r14");
    const revision15 = rendererRevisionPolicyV4("canvaskit-v4-r15");

    expect(revision15).toEqual({
      ...revision14,
      allowD20LabelClearanceShortfall: true,
    });
    expect(revision14.allowD20LabelClearanceShortfall).toBe(false);
  });

  it("adds immutable camera preset revisions", () => {
    const revision15 = rendererRevisionPolicyV4("canvaskit-v4-r15");
    const revision16 = rendererRevisionPolicyV4("canvaskit-v4-r16");
    const revision17 = rendererRevisionPolicyV4("canvaskit-v4-r17");
    const revision18 = rendererRevisionPolicyV4("canvaskit-v4-r18");

    expect(revision16).toEqual({
      ...revision15,
      cameraAngles: "presets-r16",
    });
    expect(revision17).toEqual({
      ...revision16,
      cameraAngles: "presets-r17",
    });
    expect(revision18).toEqual({
      ...revision17,
      cameraAngles: "presets-r18",
    });
    expect(revision15.cameraAngles).toBe("legacy");
  });

  it("changes only sphere label mapping in r19", () => {
    const revision18 = rendererRevisionPolicyV4("canvaskit-v4-r18");
    const revision19 = rendererRevisionPolicyV4("canvaskit-v4-r19");

    expect(revision19).toEqual({
      ...revision18,
      sphereLabelMapping: "local-frame-r19",
    });
    expect(revision18.sphereLabelMapping).toBe("legacy");
  });

  it("adds resolved authored views in r20 without changing r19", () => {
    const revision19 = rendererRevisionPolicyV4("canvaskit-v4-r19");
    const revision20 = rendererRevisionPolicyV4("canvaskit-v4-r20");

    expect(revision20).toEqual({
      ...revision19,
      resolvedViews: true,
      cameraAngles: "preferences-r20",
    });
    expect(rendererRevisionPolicyV4("canvaskit-v4-r21")).toEqual(revision20);
    expect(rendererRevisionPolicyV4("canvaskit-v4-r22")).toEqual(revision20);
    expect(rendererRevisionPolicyV4("canvaskit-v4-r23")).toEqual(revision20);
    expect(rendererRevisionPolicyV4("canvaskit-v4-r24")).toEqual({
      ...revision20,
      gridVerticalAlignment: "visual-center-r24",
    });
    const revision25 = rendererRevisionPolicyV4("canvaskit-v4-r25");
    expect(revision25).toEqual(
      rendererRevisionPolicyV4("canvaskit-v4-r24"),
    );
    const revision26 = rendererRevisionPolicyV4("canvaskit-v4-r26");
    expect(revision26).toEqual({
      ...revision25,
      d10CriticalHalo: true,
      sharedPercentileModifierIcons: true,
      fudgeCameraInset: true,
    });
    expect(rendererRevisionPolicyV4("canvaskit-v4-r27")).toEqual({
      ...revision26,
      textureColors: "balanced-surface-r27",
      balancedClassicSolidFaceLocal: true,
      faceWidePhysicalSeparation: false,
    });
    expect(revision19.resolvedViews).toBe(false);
  });

  it("rejects unknown revisions instead of inferring a policy", () => {
    expect(() =>
      rendererRevisionPolicyV4(
        "canvaskit-v4-r28" as RendererRevisionV4,
      ),
    ).toThrow("Render request rendererRevision is not supported");
  });
});
