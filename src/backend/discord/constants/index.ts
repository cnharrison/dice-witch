import {
  ActionRowBuilder,
  ButtonBuilder,
  SelectMenuBuilder,

  resolveColor,
} from "discord.js";
import { DiceTypesToDisplay } from "../../shared/types";
import { inviteLink, supportServerLink } from "../../config.json";

const availableDice: DiceTypesToDisplay[] = [100, 20, 12, 10, 8, 6, 4];

const maxImageDice: number = 50;
const maxTextDice: number = 500;
const maxDiceSides: number = 100;

const eventColor = resolveColor('#999999');
const errorColor = resolveColor('#FF0000');
const goodColor = resolveColor('#00FF00');
const infoColor = resolveColor('#1E90FF');
const tabletopColor = resolveColor('#966F33');

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
  footerButtonRow,
};
