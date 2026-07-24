import {
  APPEARANCE_TARGETS_V4,
  type AppearanceRecipeV3,
  type AppearanceTargetV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_TARGETS,
  type AppearanceBuiltinRecipesV3,
  type EffectiveAppearanceRecipeInput,
  type EffectiveAppearanceRecipeInputV2,
  type EffectiveAppearanceRecipeInputV3,
  type EffectiveAppearanceRecipesV1,
  type EffectiveAppearanceRecipesV2,
  type EffectiveAppearanceRecipesV3,
  type GuildAppearanceMode,
} from "./types";

type RecipeReference = {
  source: "builtin" | "custom";
  id: string;
};

type AppearanceProfile<Recipe, Target extends string> = {
  assignments: {
    all: RecipeReference | null;
    overrides: Partial<Record<Target, RecipeReference>>;
  };
  designs: readonly { id: string; recipe: Recipe }[];
};

type GuildAppearanceProfile<Recipe, Target extends string> =
  AppearanceProfile<Recipe, Target> & {
    mode: GuildAppearanceMode;
  };

type EffectiveAppearanceInput<Recipe, Target extends string, Builtins> = {
  personalProfile: AppearanceProfile<Recipe, Target> | null;
  guildProfile: GuildAppearanceProfile<Recipe, Target> | null;
  builtins: Builtins;
};

type BuiltinRecipeResolver<Recipe, Target extends string, Builtins> = (
  id: string,
  target: Target,
  builtins: Builtins,
) => Recipe;

function assignedReference<Recipe, Target extends string>(
  profile: AppearanceProfile<Recipe, Target>,
  target: Target,
): RecipeReference | null {
  return profile.assignments.overrides[target] ?? profile.assignments.all;
}

function plainBuiltInRecipe<Recipe>(
  id: string,
  _target: string,
  builtins: Readonly<Partial<Record<string, Recipe>>>,
): Recipe {
  const recipe = builtins[id];
  if (recipe === undefined) {
    throw new Error(`Built-in appearance recipe ${id} is required`);
  }
  return recipe;
}

function builtInRecipeV3(
  id: string,
  target: AppearanceTargetV4,
  builtins: AppearanceBuiltinRecipesV3,
): AppearanceRecipeV3 {
  const style = builtins[id];
  if (style === undefined) {
    throw new Error(`Built-in appearance recipe ${id} is required`);
  }
  return style.overrides?.[target] ?? style.recipe;
}

function referencedRecipe<Recipe, Target extends string, Builtins>(
  profile: AppearanceProfile<Recipe, Target>,
  reference: RecipeReference,
  target: Target,
  builtins: Builtins,
  resolveBuiltin: BuiltinRecipeResolver<Recipe, Target, Builtins>,
): Recipe {
  if (reference.source === "builtin") {
    return resolveBuiltin(reference.id, target, builtins);
  }
  const design = profile.designs.find(({ id }) => id === reference.id);
  if (design === undefined) {
    throw new Error(`Custom appearance recipe ${reference.id} is required`);
  }
  return design.recipe;
}

function assignedRecipe<Recipe, Target extends string, Builtins>(
  profile: AppearanceProfile<Recipe, Target> | null,
  target: Target,
  builtins: Builtins,
  resolveBuiltin: BuiltinRecipeResolver<Recipe, Target, Builtins>,
): Recipe | null {
  if (profile === null) return null;
  const reference = assignedReference(profile, target);
  return reference === null
    ? null
    : referencedRecipe(
        profile,
        reference,
        target,
        builtins,
        resolveBuiltin,
      );
}

function effectiveRecipe<Recipe, Target extends string, Builtins>(
  input: EffectiveAppearanceInput<Recipe, Target, Builtins>,
  target: Target,
  chaotic: Recipe,
  resolveBuiltin: BuiltinRecipeResolver<Recipe, Target, Builtins>,
): Recipe {
  const personal = assignedRecipe(
    input.personalProfile,
    target,
    input.builtins,
    resolveBuiltin,
  );
  const mode = input.guildProfile?.mode ?? "off";
  if (mode === "off") return personal ?? chaotic;
  const guild = assignedRecipe(
    input.guildProfile,
    target,
    input.builtins,
    resolveBuiltin,
  );
  return mode === "enforced"
    ? guild ?? personal ?? chaotic
    : personal ?? guild ?? chaotic;
}

function resolveEffectiveRecipes<Recipe, Target extends string, Builtins>(
  targets: readonly Target[],
  input: EffectiveAppearanceInput<Recipe, Target, Builtins>,
  resolveBuiltin: BuiltinRecipeResolver<Recipe, Target, Builtins>,
): Record<Target, Recipe> {
  return Object.fromEntries(
    targets.map((target) => {
      const chaotic = resolveBuiltin("chaotic", target, input.builtins);
      return [
        target,
        effectiveRecipe(input, target, chaotic, resolveBuiltin),
      ];
    }),
  ) as Record<Target, Recipe>;
}

export function resolveEffectiveAppearanceRecipes(
  input: EffectiveAppearanceRecipeInput,
): EffectiveAppearanceRecipesV1 {
  return resolveEffectiveRecipes(
    APPEARANCE_TARGETS,
    input,
    plainBuiltInRecipe,
  );
}

export function resolveEffectiveAppearanceRecipesV2(
  input: EffectiveAppearanceRecipeInputV2,
): EffectiveAppearanceRecipesV2 {
  return resolveEffectiveRecipes(
    APPEARANCE_TARGETS,
    input,
    plainBuiltInRecipe,
  );
}

export function resolveEffectiveAppearanceRecipesV3(
  input: EffectiveAppearanceRecipeInputV3,
): EffectiveAppearanceRecipesV3 {
  return resolveEffectiveRecipes(
    APPEARANCE_TARGETS_V4,
    input,
    builtInRecipeV3,
  );
}
