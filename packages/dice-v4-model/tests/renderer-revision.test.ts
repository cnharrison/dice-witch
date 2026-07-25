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

  it("rejects unknown revisions instead of inferring a policy", () => {
    expect(() =>
      rendererRevisionPolicyV4(
        "canvaskit-v4-r9" as RendererRevisionV4,
      ),
    ).toThrow("Render request rendererRevision is not supported");
  });
});
