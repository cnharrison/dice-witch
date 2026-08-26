import * as z from "zod";
import {
  parsePublicRenderModelV4,
  serializeRenderRequestV4,
  type PublicRenderModelV4,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import type {
  Die,
  RenderedRollImage,
  Result,
  RollPreparation,
  RollResponse,
} from "@/types/dice";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_ROLL_DICE = 50;
const MAX_ROLL_GROUPS = 50;
const MAX_ROLL_TEXT_CHARACTERS = 98_304;
const MAX_RENDERED_IMAGE_WIDTH = 1_500;
const MAX_RENDERED_IMAGE_HEIGHT = 9_350;
const MAX_ICON_CHARACTERS = 64;

const boundaryValueSchema = z.unknown();
type BoundaryValue = z.input<typeof boundaryValueSchema>;
const jsonObjectSchema = z.looseObject({});
type JsonObject = z.infer<typeof jsonObjectSchema>;
const stringSchema = z.string();
const numberSchema = z.number();

function isString(value: BoundaryValue): value is string {
  return stringSchema.safeParse(value).success;
}

function isNumber(value: BoundaryValue): value is number {
  return numberSchema.safeParse(value).success;
}

function isRecord(value: BoundaryValue): value is JsonObject {
  return jsonObjectSchema.safeParse(value).success;
}

function hasOnlyKeys(
  value: JsonObject,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseDie(value: BoundaryValue): Die {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "color",
      "icon",
      "rolled",
      "secondaryColor",
      "sides",
      "textColor",
      "value",
    ]) ||
    !(
      (Number.isSafeInteger(value.sides) &&
        Number(value.sides) >= 1 &&
        Number(value.sides) <= 999) ||
      value.sides === "%" ||
      value.sides === "F"
    ) ||
    !Number.isSafeInteger(value.rolled) ||
    !Number.isSafeInteger(value.value) ||
    !isString(value.color) ||
    !HEX_COLOR.test(value.color) ||
    !isString(value.secondaryColor) ||
    !HEX_COLOR.test(value.secondaryColor) ||
    !isString(value.textColor) ||
    !HEX_COLOR.test(value.textColor) ||
    !Array.isArray(value.icon) ||
    value.icon.length > 3 ||
    !value.icon.every(
      (icon) =>
        isString(icon) &&
        icon.length >= 1 &&
        icon.length <= MAX_ICON_CHARACTERS,
    )
  ) {
    throw new Error("Web roll response is invalid");
  }
  // SAFETY: The surrounding validation establishes the Die["sides"] invariant used below.
  return {
    sides: value.sides as Die["sides"],
    rolled: value.rolled,
    value: value.value,
    color: value.color,
    secondaryColor: value.secondaryColor,
    textColor: value.textColor,
    icon: [...value.icon],
  };
}

function parseResult(value: BoundaryValue): Result {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["output", "results"]) ||
    !isString(value.output) ||
    value.output.length < 1 ||
    value.output.length > MAX_ROLL_TEXT_CHARACTERS ||
    !Number.isFinite(value.results)
  ) {
    throw new Error("Web roll response is invalid");
  }
  return { output: value.output, results: Number(value.results) };
}

function parseRenderedImage(value: BoundaryValue): RenderedRollImage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["base64", "contentType", "height", "width"]) ||
    value.contentType !== "image/png" ||
    !Number.isSafeInteger(value.width) ||
    Number(value.width) < 1 ||
    Number(value.width) > MAX_RENDERED_IMAGE_WIDTH ||
    !Number.isSafeInteger(value.height) ||
    Number(value.height) < 1 ||
    Number(value.height) > MAX_RENDERED_IMAGE_HEIGHT ||
    !isString(value.base64) ||
    value.base64.length < 1 ||
    value.base64.length >
      Math.ceil((Number(value.width) * Number(value.height) * 4 + 65_536) / 3) *
        4 ||
    !BASE64.test(value.base64)
  ) {
    throw new Error("Web roll response is invalid");
  }
  return {
    contentType: "image/png",
    width: Number(value.width),
    height: Number(value.height),
    base64: value.base64,
  };
}

function parseAppearanceIdentities(
  value: BoundaryValue,
  groupSizes: readonly number[],
  errorMessage: string,
): string[][] {
  if (!Array.isArray(value) || value.length !== groupSizes.length) {
    throw new Error(errorMessage);
  }
  const identities = value.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length !== groupSizes[groupIndex]) {
      throw new Error(errorMessage);
    }
    return group.map((identity) => {
      if (
        !isString(identity) ||
        identity.length < 1 ||
        identity.length > 512
      ) {
        throw new Error(errorMessage);
      }
      return identity;
    });
  });
  const flattened = identities.flat();
  if (new Set(flattened).size !== flattened.length) {
    throw new Error(errorMessage);
  }
  return identities;
}

function parseRerolledAppearanceIdentities(
  value: BoundaryValue,
  appearanceIdentities: readonly (readonly string[])[],
): string[] {
  if (!Array.isArray(value) || !value.every(isString)) {
    throw new Error("Web roll response is invalid");
  }
  // SAFETY: The surrounding validation establishes the string[] invariant used below.
  const identities = value as string[];
  const validIdentities = new Set(appearanceIdentities.flat());
  if (
    new Set(identities).size !== identities.length ||
    identities.some((identity) => !validIdentities.has(identity))
  ) {
    throw new Error("Web roll response is invalid");
  }
  return [...identities];
}

function parseRenderModel(value: BoundaryValue): PublicRenderModelV4 {
  try {
    const renderModel = parsePublicRenderModelV4(value);
    serializeRenderRequestV4(renderModel);
    return renderModel;
  } catch {
    throw new Error("Web roll response is invalid");
  }
}

function legacySides(die: RenderDieV4): Die["sides"] {
  switch (die.target) {
    case "d4":
      return 4;
    case "d6":
      return 6;
    case "d8":
      return 8;
    case "d10":
      return 10;
    case "d12":
      return 12;
    case "d20":
      return 20;
    case "percentile":
      return "%";
    case "fudge":
      return "F";
    case "other":
      return die.sides;
  }
}

function assertRenderModelMatchesDice(
  renderModel: PublicRenderModelV4,
  diceArray: Die[][],
): void {
  if (
    renderModel.groups.length !== diceArray.length ||
    renderModel.groups.some(
      (group, groupIndex) => group.length !== diceArray[groupIndex]?.length,
    )
  ) {
    throw new Error("Web roll response does not match render model");
  }
  renderModel.groups.forEach((group, groupIndex) => {
    group.forEach((renderDie, dieIndex) => {
      const die = diceArray[groupIndex]?.[dieIndex];
      if (
        die === undefined ||
        die.sides !== legacySides(renderDie) ||
        die.rolled !== renderDie.result ||
        die.value !== renderDie.result ||
        die.color.toLowerCase() !== renderDie.appearance.palette[0] ||
        die.secondaryColor.toLowerCase() !== renderDie.appearance.palette[1] ||
        die.textColor.toLowerCase() !== renderDie.appearance.engraving.color ||
        die.icon.length !== renderDie.icons.length ||
        !die.icon.every((icon, index) => icon === renderDie.icons[index])
      ) {
        throw new Error("Web roll response does not match render model");
      }
    });
  });
}

export function parseWebRollPreparation(value: BoundaryValue): RollPreparation {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "appearanceDigest",
      "appearanceIdentities",
      "groupSizes",
      "renderedImage",
      "renderModel",
      "renderSeed",
    ]) ||
    !isString(value.appearanceDigest) ||
    !SHA256.test(value.appearanceDigest) ||
    !isNumber(value.renderSeed) ||
    !Number.isInteger(value.renderSeed) ||
    value.renderSeed < 0 ||
    value.renderSeed > 0xffff_ffff ||
    !Array.isArray(value.groupSizes) ||
    value.groupSizes.length < 1 ||
    value.groupSizes.length > MAX_ROLL_GROUPS ||
    !value.groupSizes.every(
      (size) => Number.isSafeInteger(size) && Number(size) >= 1,
    ) ||
    value.groupSizes.reduce(
      (total, size) => total + Number(size),
      0,
    ) > MAX_ROLL_DICE
  ) {
    throw new Error("Web roll preparation is invalid");
  }
  const groupSizes = value.groupSizes.map(Number);
  const appearanceIdentities = parseAppearanceIdentities(
    value.appearanceIdentities,
    groupSizes,
    "Web roll preparation is invalid",
  );
  const renderedImage = parseRenderedImage(value.renderedImage);
  const renderModel =
    value.renderModel === undefined
      ? undefined
      : parseRenderModel(value.renderModel);
  if (
    renderModel !== undefined &&
    (renderModel.groups.length !== groupSizes.length ||
      renderModel.groups.some(
        (group, index) => group.length !== groupSizes[index],
      ))
  ) {
    throw new Error("Web roll preparation does not match render model");
  }
  const preparation: RollPreparation = {
    renderSeed: value.renderSeed,
    appearanceDigest: value.appearanceDigest,
    groupSizes,
    appearanceIdentities,
    renderedImage,
  };
  if (renderModel !== undefined) Object.assign(preparation, { renderModel });
  return preparation;
}

export function parseWebRollResponse(value: BoundaryValue): RollResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "appearanceIdentities",
      "diceArray",
      "error",
      "message",
      "renderedImage",
      "renderModel",
      "rerolledAppearanceIdentities",
      "resultArray",
    ]) ||
    !Array.isArray(value.diceArray) ||
    value.diceArray.length > MAX_ROLL_GROUPS ||
    !Array.isArray(value.resultArray) ||
    value.resultArray.length > MAX_ROLL_GROUPS ||
    !isString(value.message) ||
    value.message.length < 1 ||
    value.message.length > MAX_ROLL_TEXT_CHARACTERS ||
    !(
      value.error === undefined ||
      (isString(value.error) &&
        value.error.length >= 1 &&
        value.error.length <= MAX_ROLL_TEXT_CHARACTERS)
    )
  ) {
    throw new Error("Web roll response is invalid");
  }
  const diceArray = value.diceArray.map((group) => {
    if (!Array.isArray(group) || group.length < 1) {
      throw new Error("Web roll response is invalid");
    }
    return group.map(parseDie);
  });
  if (
    diceArray.reduce((count, group) => count + group.length, 0) > MAX_ROLL_DICE
  ) {
    throw new Error("Web roll response is invalid");
  }
  const resultArray = value.resultArray.map(parseResult);
  const appearanceIdentities = parseAppearanceIdentities(
    value.appearanceIdentities,
    diceArray.map((group) => group.length),
    "Web roll response is invalid",
  );
  const rerolledAppearanceIdentities = parseRerolledAppearanceIdentities(
    value.rerolledAppearanceIdentities,
    appearanceIdentities,
  );
  if (resultArray.length !== diceArray.length) {
    throw new Error("Web roll response result groups do not match dice");
  }
  const renderedImage =
    value.renderedImage === undefined
      ? undefined
      : parseRenderedImage(value.renderedImage);
  const renderModel =
    value.renderModel === undefined
      ? undefined
      : parseRenderModel(value.renderModel);

  const isRolledResponse =
    value.error === undefined || value.error === "PERMISSION_ERROR";
  if (isRolledResponse) {
    if (
      diceArray.length < 1 ||
      resultArray.length < 1 ||
      renderedImage === undefined
    ) {
      throw new Error("Web roll response is invalid");
    }
  } else if (
    value.error !== value.message ||
    diceArray.length !== 0 ||
    resultArray.length !== 0 ||
    renderedImage !== undefined ||
    renderModel !== undefined
  ) {
    throw new Error("Web roll response is invalid");
  }
  if (renderModel !== undefined) {
    if (renderedImage === undefined) {
      throw new Error("Web roll response is invalid");
    }
    assertRenderModelMatchesDice(renderModel, diceArray);
  }

  const rollResponse: RollResponse = {
    diceArray,
    resultArray,
    appearanceIdentities,
    rerolledAppearanceIdentities,
    message: value.message,
  };
  if (value.error !== undefined) Object.assign(rollResponse, { error: value.error });
  if (renderedImage !== undefined) Object.assign(rollResponse, { renderedImage });
  if (renderModel !== undefined) Object.assign(rollResponse, { renderModel });
  return rollResponse;
}
