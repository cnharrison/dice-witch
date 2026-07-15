import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";

const BUTTON_ROWS = [
  [
    ["knowledgebase-exploding", "Exploding 💥"],
    ["knowledgebase-reroll", "Re-roll ♻"],
    ["knowledgebase-keepdrop", "Keep/drop 🚮"],
    ["knowledgebase-target", "Targets 🎯"],
    ["knowledgebase-crit", "Criticals ⚔"],
  ],
  [
    ["knowledgebase-math", "Math 🧮"],
    ["knowledgebase-sort", "Sorting ↕"],
    ["knowledgebase-repeating", "Repeating 👯‍♀️"],
    ["knowledgebase-unique", "Unique ❄️"],
    ["knowledgebase-fudge", "Fudge 🎲"],
  ],
] as const;

export const ROLL_HELPER_ANNOUNCEMENT =
  " 🚫🎲 Invalid dice notation! DMing you some help 😉";
export const ROLL_HELPER_DM_ANNOUNCEMENT =
  " 🚫🎲 Invalid dice notation! Here's some help 😉";

export function buildRollHelperMessage(
  links: DiscordFooterLinks,
): Record<string, unknown> {
  const description =
    "The `/roll` command has three arguments: `notation`, `title`, and `timestorepeat`. The `notation` argument must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any dice, but you can only see images of these dice: **d100, d20, d12, d10, d8, d6, d4, dF**.\nYou can roll up to **50** dice at once 😈\n\n";
  return {
    embeds: [
      {
        color: 0x00_00_ff,
        fields: [{ name: "Need help? 😅", value: description }],
      },
    ],
    components: [
      ...BUTTON_ROWS.map((buttons) => ({
        type: 1,
        components: buttons.map(([customId, label]) => ({
          type: 2,
          style: 1,
          custom_id: customId,
          label,
        })),
      })),
      ...buildFooterComponents(links),
    ],
    allowed_mentions: { parse: [] },
  };
}
