import {
  parsePublicRenderModelV4,
  resolveRenderViewV4,
  type AppearanceRecipeV3,
  type DiceViewPreferencesV4,
  type PublicRenderModelV4,
} from "@dice-witch/dice-v4-model";

export function applyDiceViewToPreviewModelV4(
  model: PublicRenderModelV4,
  recipe: AppearanceRecipeV3,
  renderSeed: number,
  diceView: DiceViewPreferencesV4,
): PublicRenderModelV4 {
  return parsePublicRenderModelV4({
    ...model,
    groups: model.groups.map((group, groupIndex) =>
      group.map((die, dieIndex) => ({
        ...die,
        view: resolveRenderViewV4({
          target: die.target,
          preferenceTarget:
            die.target === "d10" && die.faceLabelSet === "percentile-ones"
              ? "percentile"
              : die.target,
          result: die.result,
          form: die.form,
          recipe,
          renderSeed,
          groupIndex,
          dieIndex,
          diceView,
          rendererRevision: model.rendererRevision,
        }),
      })),
    ),
  });
}
