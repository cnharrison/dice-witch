import {
  MAX_REPETITIONS,
  type RollDie,
  type RollExecutionResult,
} from "../../roll-domain/src";
import { createDeterministicRandom } from "../../roll-domain/src/random";
import {
  DISCORD_COMPONENTS_V2_FLAG,
  type DiscordComponentsV2Message,
  type DiscordContainerChild,
  type DiscordTextDisplay,
} from "./responses";

const TABLETOP_COLOR = 0x96_6f_33;
const ERROR_COLOR = 0xe7_4c_3c;
const MAX_RESULT_DESCRIPTION_LENGTH = 4_096;
const MAX_TEXT_DISPLAY_LENGTH = 4_000;
const MAX_TITLE_LENGTH = 256;
const MAX_USERNAME_LENGTH = 32;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;

export type RollResultMessageOptions = {
  source: "discord" | "web";
  title: string | null;
  repetitions: number;
  username: string;
  filename: string;
  clatter?: string;
  savedRoll?: { scope: "Mine" | "Server"; name: string };
  saveRollCustomId?: string;
};

function escapeDiscordMarkdown(value: string): string {
  let escaped = value;
  for (const character of [
    "\\",
    "`",
    "*",
    "_",
    "{",
    "}",
    "[",
    "]",
    "(",
    ")",
    "<",
    ">",
    "#",
    "+",
    "-",
    ".",
    "!",
    "|",
    "~",
  ]) {
    escaped = escaped.split(character).join(`\\${character}`);
  }
  return escaped;
}

function savedRollAttributionSuffix(
  savedRoll: RollResultMessageOptions["savedRoll"],
): string {
  if (savedRoll === undefined) return "";
  const owner = savedRoll.scope === "Server" ? "server" : "personal";
  return ` · from ${owner} library · ${escapeDiscordMarkdown(savedRoll.name)}`;
}

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

export function rollClatterText(
  result: RollExecutionResult,
  seed: number,
): string {
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
  if (maximum <= minimum) return defaultMessage;

  const percentile = ((total - minimum) / (maximum - minimum)) * 100;
  const first = groups[0]?.[0];
  const extremeSingle =
    single &&
    typeof first?.sides === "number" &&
    ((first.sides === 4 && total === 4) ||
      (first.sides === 6 && total === 6));
  if (!extremeSingle && percentile < 99 && total !== maximum && percentile > 5) {
    return defaultMessage;
  }

  const random = createDeterministicRandom((seed ^ 0x434c_4154) >>> 0);
  const index = 1 + (random.nextUint32() % (messages.length - 1));
  const message = messages[index];
  if (message === undefined) {
    throw new Error("Roll clatter variant is unavailable");
  }
  return message;
}

function textMessage(content: string): DiscordComponentsV2Message {
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [{ type: 10, content }],
  };
}

export function buildRollClatterMessage(
  result: RollExecutionResult,
  seed: number,
): DiscordComponentsV2Message {
  return textMessage(rollClatterText(result, seed));
}

export function rollErrorText(result: RollExecutionResult): string {
  if (result.outcomes.length > 0 || result.errors.length === 0) {
    throw new Error("Roll result does not contain a terminal display error");
  }
  const overLimit = result.errors.some((error) =>
    ["TOO_MANY_DICE", "TOO_MANY_SIDES", "UNSAFE_EXPLOSION"].includes(error.code),
  );
  return overLimit
    ? "50 dice max and 999 sides max, sorry 😅"
    : "🚫🎲 Invalid dice notation!";
}

export function buildRollErrorMessage(
  result: RollExecutionResult,
): DiscordComponentsV2Message {
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: ERROR_COLOR,
        components: [
          {
            type: 10,
            content: rollErrorText(result),
          },
        ],
      },
    ],
  };
}

function textDisplays(content: string): DiscordTextDisplay[] {
  const displays: DiscordTextDisplay[] = [];
  let remaining = content;
  while (remaining.length > MAX_TEXT_DISPLAY_LENGTH) {
    const newline = remaining.lastIndexOf("\n", MAX_TEXT_DISPLAY_LENGTH);
    const splitAt = newline > 0 ? newline : MAX_TEXT_DISPLAY_LENGTH;
    displays.push({ type: 10, content: remaining.slice(0, splitAt) });
    remaining = remaining.slice(splitAt + (newline > 0 ? 1 : 0));
  }
  if (remaining.length > 0) displays.push({ type: 10, content: remaining });
  return displays;
}

export function rollResultText(result: RollExecutionResult): string {
  const grandTotal = result.outcomes.reduce(
    (total, outcome) => total + outcome.total,
    0,
  );
  const description = `${result.outcomes
    .map((outcome) => outcome.output)
    .join("\n")} ${
    result.outcomes.length > 1 ? `\ngrand total = ${String(grandTotal)}` : ""
  }`;
  return description.length > MAX_RESULT_DESCRIPTION_LENGTH
    ? "Roll result exceeds Discord's 4,096-character message limit."
    : description;
}

function resultHeadingText(options: RollResultMessageOptions): string | null {
  if (options.title !== null) return options.title;
  if (options.savedRoll !== undefined) return options.savedRoll.name;
  return options.repetitions > 1 ? `Repeated ×${String(options.repetitions)}` : null;
}

function resultHeading(
  options: RollResultMessageOptions,
): DiscordContainerChild[] {
  const heading = resultHeadingText(options);
  if (heading === null) return [];
  const content = `## ${escapeDiscordMarkdown(heading)}`;
  if (options.saveRollCustomId === undefined) {
    return [{ type: 10, content }];
  }
  return [
    {
      type: 9,
      components: [{ type: 10, content }],
      accessory: {
        type: 2,
        style: 2,
        label: "Save roll",
        custom_id: options.saveRollCustomId,
      },
    },
  ];
}

export function buildRollResultMessage(
  result: RollExecutionResult,
  options: RollResultMessageOptions,
): DiscordComponentsV2Message {
  if (result.outcomes.length === 0) {
    throw new Error("Roll result has no displayable outcomes");
  }
  const heading = resultHeadingText(options);
  if (
    (options.title !== null &&
      (options.title.length === 0 || options.title.length > MAX_TITLE_LENGTH)) ||
    !Number.isSafeInteger(options.repetitions) ||
    options.repetitions < 1 ||
    options.repetitions > MAX_REPETITIONS ||
    options.username.length === 0 ||
    options.username.length > MAX_USERNAME_LENGTH ||
    !PNG_FILENAME.test(options.filename) ||
    (options.clatter !== undefined &&
      (options.clatter.length === 0 || options.clatter.length > 2_000)) ||
    (options.savedRoll !== undefined &&
      (options.savedRoll.name.length === 0 ||
        options.savedRoll.name.length > 1_024)) ||
    (options.saveRollCustomId !== undefined &&
      (heading === null ||
        options.saveRollCustomId.length < 1 ||
        options.saveRollCustomId.length > 100))
  ) {
    throw new Error("Roll result message options are invalid");
  }
  const resultText = rollResultText(result);
  const container: DiscordContainerChild[] = [
    ...resultHeading(options),
    ...textDisplays(resultText),
    {
      type: 12,
      items: [
        {
          media: { url: `attachment://${options.filename}` },
          description: "Rendered dice result",
        },
      ],
    },
    { type: 14, divider: true, spacing: 1 },
    {
      type: 10,
      content: `-# sent to ${escapeDiscordMarkdown(options.username)} via ${options.source}${savedRollAttributionSuffix(options.savedRoll)}`,
    },
  ];
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [
      ...(options.clatter === undefined
        ? []
        : [{ type: 10 as const, content: options.clatter }]),
      { type: 17, accent_color: TABLETOP_COLOR, components: container },
    ],
  };
}
