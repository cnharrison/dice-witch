import {
  ColorResolvable,
  ActionRowBuilder,
  ButtonBuilder,
  SelectMenuBuilder,
} from "discord.js";
import { DiceTypesToDisplay } from "../types";
import { inviteLink, supportServerLink } from "../../config.json";

const availableDice: DiceTypesToDisplay[] = [100, 20, 12, 10, 8, 6, 4];

const maxImageDice: number = 50;
const maxTextDice: number = 500;
const maxDiceSides: number = 100;

const eventColor: ColorResolvable = "#99999";
const errorColor: ColorResolvable = "#FF0000";
const goodColor: ColorResolvable = "#00FF00";
const infoColor: ColorResolvable = "#1E90FF";
const tabletopColor: ColorResolvable = "#966F33";

const deprecationWarning = `⚠** BEGIN SCARY WARNING **⚠\n\n The \`!roll\` and \`!titledroll\` commands are being deprecated. You should start using \`/roll\` instead (It's much better 😈). For help with it, just start typing \`/roll\`. If you invited Dice Witch on or before **August 1, 2021**, you will need to grant her permissions to create slash commands on your server before you will see the \`/roll\` command. You can do this by clicking [here](${inviteLink}).\n\n⚠ **END SCARY WARNING** ⚠`;

const footerButtonRow = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder().setLabel("Invite me").setStyle(5).setURL(inviteLink)
  )
  .addComponents(
    new ButtonBuilder()
      .setLabel("Questions? Join the support server")
      .setStyle(5)
      .setURL(supportServerLink)
  ) as ActionRowBuilder<SelectMenuBuilder>;

export {
  availableDice,
  maxImageDice,
  maxTextDice,
  maxDiceSides,
  eventColor,
  errorColor,
  goodColor,
  infoColor,
  tabletopColor,
  deprecationWarning,
  footerButtonRow,
};
