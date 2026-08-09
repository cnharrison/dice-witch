import { RENDERER_REVISIONS_V4 } from "./registries";
import type { ModifierIconDesignV4 } from "./modifier-icons";
import type { RendererRevisionV4 } from "./types";

export type RendererRevisionPolicyV4 = {
  explicitTextureScope: boolean;
  resolvedViews: boolean;
  d20Geometry: "r1" | "r2";
  gradientMapping: "legacy" | "projected";
  patternMapping: "legacy" | "projected" | "surface";
  textureColors: "legacy" | "vivid-r4" | "exact-gradient-r5";
  presentation:
    | "legacy"
    | "standard-r4"
    | "standard-r5"
    | "standard-r6"
    | "standard-r7";
  restrainedClassicGradientLighting: boolean;
  materialGradientLift: boolean;
  materialParityEmissive: boolean;
  engravingContrastEdge: boolean;
  d4EngravingFinishEnhancement: boolean;
  d20LiberationSansScale: boolean;
  allowD20LabelClearanceShortfall: boolean;
  cameraAngles:
    | "legacy"
    | "presets-r16"
    | "presets-r17"
    | "presets-r18"
    | "preferences-r20";
  sphereLabelMapping: "legacy" | "local-frame-r19";
  uniformD20Ink: boolean;
  sphereOutline: boolean;
  strongPhysicalEdges: boolean;
  modifierIcons: ModifierIconDesignV4;
  gridLayout:
    | "legacy"
    | "compact-r9"
    | "group-rows-r10"
    | "group-rows-r11"
    | "group-rows-r12"
    | "group-rows-r13"
    | "group-rows-r14";
};

function policy(
  value: RendererRevisionPolicyV4,
): Readonly<RendererRevisionPolicyV4> {
  return Object.freeze(value);
}

const r1 = policy({
  explicitTextureScope: false,
  resolvedViews: false,
  d20Geometry: "r1",
  gradientMapping: "legacy",
  patternMapping: "legacy",
  textureColors: "legacy",
  presentation: "legacy",
  restrainedClassicGradientLighting: false,
  materialGradientLift: false,
  materialParityEmissive: false,
  engravingContrastEdge: false,
  d4EngravingFinishEnhancement: false,
  d20LiberationSansScale: false,
  allowD20LabelClearanceShortfall: false,
  cameraAngles: "legacy",
  sphereLabelMapping: "legacy",
  uniformD20Ink: false,
  sphereOutline: false,
  strongPhysicalEdges: false,
  modifierIcons: "legacy-r1",
  gridLayout: "legacy",
});
const r2 = policy({ ...r1, explicitTextureScope: true });
const r3 = policy({ ...r2, d20Geometry: "r2" });
const r4 = policy({
  ...r3,
  gradientMapping: "projected",
  patternMapping: "projected",
  textureColors: "vivid-r4",
  presentation: "standard-r4",
  uniformD20Ink: true,
  sphereOutline: true,
  strongPhysicalEdges: true,
});
const r5 = policy({
  ...r4,
  textureColors: "exact-gradient-r5",
  presentation: "standard-r5",
  restrainedClassicGradientLighting: true,
  materialGradientLift: true,
});
const r6 = policy({
  ...r5,
  presentation: "standard-r6",
  materialParityEmissive: true,
  engravingContrastEdge: true,
  d4EngravingFinishEnhancement: true,
  d20LiberationSansScale: true,
});
const r7 = policy({
  ...r6,
  patternMapping: "surface",
  presentation: "standard-r7",
});
const r8 = policy({ ...r7, modifierIcons: "signal-disks-r8" });
const r9 = policy({ ...r8, gridLayout: "compact-r9" });
const r10 = policy({ ...r9, gridLayout: "group-rows-r10" });
const r11 = policy({ ...r10, gridLayout: "group-rows-r11" });
const r12 = policy({ ...r11, gridLayout: "group-rows-r12" });
const r13 = policy({ ...r12, gridLayout: "group-rows-r13" });
const r14 = policy({ ...r13, gridLayout: "group-rows-r14" });
const r15 = policy({ ...r14, allowD20LabelClearanceShortfall: true });
const r16 = policy({ ...r15, cameraAngles: "presets-r16" });
const r17 = policy({ ...r16, cameraAngles: "presets-r17" });
const r18 = policy({ ...r17, cameraAngles: "presets-r18" });
const r19 = policy({ ...r18, sphereLabelMapping: "local-frame-r19" });
const r20 = policy({
  ...r19,
  resolvedViews: true,
  cameraAngles: "preferences-r20",
});
const r21 = policy({ ...r20 });

export const RENDERER_REVISION_POLICIES_V4 = Object.freeze({
  "canvaskit-v4-r1": r1,
  "canvaskit-v4-r2": r2,
  "canvaskit-v4-r3": r3,
  "canvaskit-v4-r4": r4,
  "canvaskit-v4-r5": r5,
  "canvaskit-v4-r6": r6,
  "canvaskit-v4-r7": r7,
  "canvaskit-v4-r8": r8,
  "canvaskit-v4-r9": r9,
  "canvaskit-v4-r10": r10,
  "canvaskit-v4-r11": r11,
  "canvaskit-v4-r12": r12,
  "canvaskit-v4-r13": r13,
  "canvaskit-v4-r14": r14,
  "canvaskit-v4-r15": r15,
  "canvaskit-v4-r16": r16,
  "canvaskit-v4-r17": r17,
  "canvaskit-v4-r18": r18,
  "canvaskit-v4-r19": r19,
  "canvaskit-v4-r20": r20,
  "canvaskit-v4-r21": r21,
} satisfies Record<RendererRevisionV4, Readonly<RendererRevisionPolicyV4>>);

export function rendererRevisionPolicyV4(
  rendererRevision: RendererRevisionV4,
): Readonly<RendererRevisionPolicyV4> {
  if (!RENDERER_REVISIONS_V4.includes(rendererRevision)) {
    throw new Error("Render request rendererRevision is not supported");
  }
  return RENDERER_REVISION_POLICIES_V4[rendererRevision];
}
