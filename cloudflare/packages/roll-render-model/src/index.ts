import type {
  IconName,
  PatternName,
  RenderDie,
  RenderRequest,
} from "../../dice-svg/src/types";
import type {
  RollDie,
  RollExecutionResult,
} from "../../roll-domain/src";
import {
  createDeterministicRandom,
  type DeterministicRandom,
} from "../../roll-domain/src/random";

const PATTERNS: readonly PatternName[] = [
  "checkerboard",
  "dots",
  "stripes",
  "stars",
  "zigzag",
  "triangles",
  "honeycomb",
  "circuit",
  "crosshatch",
  "swirl",
];

function randomColor(random: DeterministicRandom): string {
  return `#${(random.nextUint32() & 0xff_ffff).toString(16).padStart(6, "0")}`;
}

function textColor(color: string, secondaryColor: string): string {
  const channels = [color, secondaryColor].flatMap((value) => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ]);
  const brightness =
    channels.reduce((total, channel) => total + channel, 0) / channels.length;
  return brightness < 128 ? "#faf9f6" : "#000000";
}

function iconsFor(modifiers: readonly string[]): IconName[] {
  const modifierSet = new Set(modifiers);
  const icons: IconName[] = [];
  if (modifierSet.has("drop")) icons.push("trashcan");
  if (modifierSet.has("penetrate")) icons.push("penetrate");
  else if (modifierSet.has("explode")) icons.push("explosion");
  if (modifierSet.has("critical-success")) icons.push("critical-success");
  if (modifierSet.has("critical-failure")) icons.push("critical-failure");
  if (modifierSet.has("target-success")) icons.push("target-success");
  if (modifierSet.has("re-roll") || modifierSet.has("reroll")) {
    icons.push("recycle");
  }
  if (modifierSet.has("min")) icons.push("chevronUp");
  if (modifierSet.has("max")) icons.push("chevronDown");
  if (modifierSet.has("unique")) icons.push("unique");
  return icons.length <= 3 ? icons : [];
}

function renderedFace(die: RollDie): number {
  if (die.sides === "F" && ![-1, 0, 1].includes(die.rolled)) return 0;
  return die.rolled;
}

function renderDie(die: RollDie, random: DeterministicRandom): RenderDie {
  const modifiers = new Set(die.modifiers);
  let color = randomColor(random);
  const secondaryColor = randomColor(random);
  if (modifiers.has("critical-success")) color = "#ffcc00";
  else if (modifiers.has("critical-failure")) color = "#ff3333";
  const pattern = PATTERNS[random.nextUint32() % PATTERNS.length];
  const fill =
    random.nextFloat() < 0.4 && pattern !== undefined
      ? { type: "pattern" as const, pattern }
      : { type: "gradient" as const };
  return {
    sides: die.sides,
    rolled: renderedFace(die),
    color,
    secondaryColor,
    textColor: textColor(color, secondaryColor),
    outlineColor: "#000000",
    icons: iconsFor(die.modifiers),
    fill,
  };
}

export function buildRollRenderRequest(
  result: RollExecutionResult,
  renderSeed: number,
): RenderRequest {
  if (!Number.isInteger(renderSeed) || renderSeed < 0 || renderSeed > 0xffff_ffff) {
    throw new Error("Render seed must be an unsigned 32-bit integer");
  }
  const random = createDeterministicRandom(renderSeed);
  const groups = result.outcomes
    .map((outcome) => outcome.dice.map((die) => renderDie(die, random)))
    .filter((group) => group.length > 0);
  if (groups.length === 0) {
    throw new Error("Roll result has no renderable dice");
  }
  return { version: 1, groups };
}
