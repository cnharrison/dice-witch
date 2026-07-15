import type { RollDie, RollExecutionResult } from "../../roll-domain/src";
import { createDeterministicRandom } from "../../roll-domain/src/random";
import type { DiscordMessage } from "./responses";

const TABLETOP_COLOR = 0x966f33;
const MAX_EMBED_DESCRIPTION_LENGTH = 4_096;
const MAX_TITLE_LENGTH = 256;
const MAX_USERNAME_LENGTH = 32;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;

export type RollResultMessageOptions = {
  source: "discord" | "web";
  title: string | null;
  username: string;
  filename: string;
  clatter?: string;
};

function clatterMessages(single: boolean): string[] {
  const pick = (singular: string, plural: string) =>
    single ? singular : plural;
  return [
    `_...the ${pick("die", "dice")} ${pick("clatters", "clatter")} across the table..._`,
    `_...as the ${pick("die", "dice")} ${pick("tumbles", "tumble")}, ${pick("it", "one")} continues to spin on its axis for a few seconds, as if possessed by an unknown force..._`,
    `_...the ${pick("die", "dice")} ${pick("bangs", "bang")} angrily across the table..._`,
    `_...the ${pick("die", "dice")} ${pick("clatters", "clatter")} crisply across the table..._`,
    `_...as the ${pick("die", "dice")} ${pick("rolls", "roll")} across the gnarly surface, you think you can spot a faint light emanating from deep within ${pick("it..._", "one of them..._")}`,
    `_...a sibilant wind suddenly hisses across the table as the restless ${pick("die", "dice")} ${pick("settles", "settle")} onto its planks..._`,
    `_...the ${pick("die", "dice")} ${pick("bumps", "bump")} proudly across the table's wizened grooves..._`,
    `_...the ${pick("die", "dice")} ${pick("dances", "dance")} and ${pick("pirouettes", "pirouette")} across the table's ancient cracks..._`,
    `_...the ${pick("die", "dice")} ${pick("skitters", "skitter")} across the table, then ${pick("settles", "settle")} with a faint, satisfied tap..._`,
    `_...the ${pick("die", "dice")} ${pick("tumbles", "tumble")} in a tight spiral, as if tracing a tiny glyph in the air..._`,
    `_...the ${pick("die", "dice")} ${pick("hops", "hop")} once, twice, and ${pick("comes", "come")} to rest where ${pick("it was", "they were")} always headed..._`,
  ];
}

function clatterTotals(dice: RollDie[]): {
  total: number;
  minimum: number;
  maximum: number;
} {
  let total = 0;
  let minimum = 0;
  let maximum = 0;
  for (let index = 0; index < dice.length; index += 1) {
    const die = dice[index];
    if (die === undefined) continue;
    if (die.sides === "%") {
      const ones = dice[index + 1];
      const tensValue = die.rolled;
      const onesValue = ones?.sides === 10 ? ones.rolled : 0;
      total += tensValue === 0 && onesValue === 0 ? 100 : tensValue + onesValue;
      minimum += 1;
      maximum += 100;
      index += 1;
      continue;
    }
    total += die.rolled;
    minimum += 1;
    maximum += typeof die.sides === "number" ? die.sides : 0;
  }
  return { total, minimum, maximum };
}

export function buildRollClatterMessage(
  result: RollExecutionResult,
  seed: number,
): DiscordMessage {
  const groups = result.outcomes.map((outcome) => outcome.dice);
  const dice = groups.flat();
  if (dice.length === 0) {
    throw new Error("Roll result has no dice to clatter");
  }
  const single = groups.length === 1 && groups[0]?.length === 1;
  const messages = clatterMessages(single);
  const defaultMessage = messages[0];
  if (defaultMessage === undefined) {
    throw new Error("Roll clatter messages are unavailable");
  }
  const { total, minimum, maximum } = clatterTotals(dice);
  if (maximum <= minimum) return { content: defaultMessage };

  const percentile = ((total - minimum) / (maximum - minimum)) * 100;
  const first = groups[0]?.[0];
  const extremeSingle =
    single &&
    typeof first?.sides === "number" &&
    ((first.sides === 4 && total === 4) ||
      (first.sides === 6 && total === 6));
  if (!extremeSingle && percentile < 99 && total !== maximum && percentile > 5) {
    return { content: defaultMessage };
  }

  const random = createDeterministicRandom((seed ^ 0x434c_4154) >>> 0);
  const index = 1 + (random.nextUint32() % (messages.length - 1));
  const message = messages[index];
  if (message === undefined) {
    throw new Error("Roll clatter variant is unavailable");
  }
  return { content: message };
}

export function buildRollErrorMessage(
  result: RollExecutionResult,
): DiscordMessage {
  if (result.outcomes.length > 0 || result.errors.length === 0) {
    throw new Error("Roll result does not contain a terminal display error");
  }
  const overLimit = result.errors.some((error) =>
    ["TOO_MANY_DICE", "TOO_MANY_SIDES", "UNSAFE_EXPLOSION"].includes(error.code),
  );
  return {
    content: overLimit
      ? "50 dice max and 999 sides max, sorry 😅"
      : "🚫🎲 Invalid dice notation!",
  };
}

export function buildRollResultMessage(
  result: RollExecutionResult,
  options: RollResultMessageOptions,
): DiscordMessage {
  if (result.outcomes.length === 0) {
    throw new Error("Roll result has no displayable outcomes");
  }
  if (
    (options.title !== null &&
      (options.title.length === 0 || options.title.length > MAX_TITLE_LENGTH)) ||
    options.username.length === 0 ||
    options.username.length > MAX_USERNAME_LENGTH ||
    !PNG_FILENAME.test(options.filename) ||
    (options.clatter !== undefined &&
      (options.clatter.length === 0 || options.clatter.length > 2_000))
  ) {
    throw new Error("Roll result message options are invalid");
  }
  const grandTotal = result.outcomes.reduce(
    (total, outcome) => total + outcome.total,
    0,
  );
  const description = `${result.outcomes
    .map((outcome) => outcome.output)
    .join("\n")} ${
    result.outcomes.length > 1 ? `\ngrand total = ${String(grandTotal)}` : ""
  }`;
  if (description.length > MAX_EMBED_DESCRIPTION_LENGTH) {
    return {
      content: "Roll result exceeds Discord's 4,096-character message limit.",
    };
  }
  return {
    ...(options.clatter === undefined ? {} : { content: options.clatter }),
    embeds: [
      {
        ...(options.title === null ? {} : { title: options.title }),
        description,
        color: TABLETOP_COLOR,
        footer: { text: `sent to ${options.username} via ${options.source}` },
        image: { url: `attachment://${options.filename}` },
      },
    ],
  };
}
