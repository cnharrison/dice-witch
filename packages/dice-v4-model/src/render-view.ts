import { getAuthoredRenderViewV4 } from "./authored-views";
import {
  CAMERA_AZIMUTH_OFFSETS_R17_V4,
  CAMERA_ELEVATION_DEGREES_R16_V4,
  POSE_AZIMUTHS_R17_V4,
  SPHERE_LABEL_PRESETS_R18_V4,
} from "./geometry";
import {
  createDeterministicRandomV4,
  deriveAppearanceSeedV4,
  deriveNamedSeedV4,
  type AppearanceSeedInputV4,
} from "./random";
import type {
  AppearanceRecipeV3,
  AppearanceTargetV4,
  DiceViewPreferencesV4,
  RenderDieV4,
  RendererRevisionV4,
  RenderViewV4,
} from "./types";

export type RenderViewInputV4 = Readonly<{
  target: AppearanceTargetV4;
  preferenceTarget: AppearanceTargetV4;
  result: number;
  form: RenderDieV4["form"];
  recipe: AppearanceRecipeV3;
  renderSeed: number;
  groupIndex: number;
  dieIndex: number;
  groupIdentity?: string;
  dieIdentity?: string;
  diceView: DiceViewPreferencesV4 | null;
  rendererRevision: RendererRevisionV4;
}>;

function selectCameraPreset<Preset>(
  seed: number,
  presets: readonly Preset[],
): Preset {
  const preset = presets[createDeterministicRandomV4(seed).index(presets.length)];
  if (preset === undefined) throw new Error("Camera preset is missing");
  return preset;
}

export function resolveRenderViewV4({
  target,
  preferenceTarget,
  result,
  form,
  recipe,
  renderSeed,
  groupIndex,
  dieIndex,
  groupIdentity,
  dieIdentity,
  diceView,
  rendererRevision,
}: RenderViewInputV4): RenderViewV4 {
  if (diceView?.mode === "legacy" || diceView?.mode === "clear") {
    return getAuthoredRenderViewV4(rendererRevision, diceView.mode, {
      target,
      form,
      result,
    });
  }
  const seedInput: AppearanceSeedInputV4 = {
    renderSeed,
    target,
    groupIndex,
    dieIndex,
    variation: "curated",
    varyBy: "die",
    recipe,
  };
  if (groupIdentity !== undefined) seedInput.groupIdentity = groupIdentity;
  if (dieIdentity !== undefined) seedInput.dieIdentity = dieIdentity;
  const scopedSeed = deriveAppearanceSeedV4(seedInput);
  const cameraSeed = deriveNamedSeedV4(scopedSeed, "camera");
  const azimuthPreference =
    diceView?.azimuth.overrides[preferenceTarget] ?? diceView?.azimuth.all;
  if (form === "sphere") {
    const preset = selectCameraPreset(cameraSeed, SPHERE_LABEL_PRESETS_R18_V4);
    return {
      kind: "sphere-surface",
      rotationDegrees: preset.rotationDegrees,
      labelLongitudeDegrees:
        azimuthPreference?.mode === "custom"
          ? azimuthPreference.customDegrees
          : preset.longitudeDegrees,
      labelLatitudeDegrees: preset.latitudeDegrees,
      labelRotationDegrees: preset.rotationDegrees,
    };
  }
  const azimuthOffsetDegrees =
    azimuthPreference?.mode === "custom"
      ? azimuthPreference.customDegrees
      : selectCameraPreset(cameraSeed, CAMERA_AZIMUTH_OFFSETS_R17_V4);
  const poseAzimuthDegrees = selectCameraPreset(
    deriveNamedSeedV4(cameraSeed, "pose"),
    POSE_AZIMUTHS_R17_V4,
  );
  return {
    kind: "camera",
    elevationDegrees:
      diceView?.elevationDegrees ?? CAMERA_ELEVATION_DEGREES_R16_V4,
    azimuthOffsetDegrees,
    poseAzimuthDegrees,
  };
}
