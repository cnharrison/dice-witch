import {
  ActionRowBuilder,
  ButtonBuilder,
  SelectMenuBuilder,
  resolveColor,
} from "discord.js";
import { DiceTypesToDisplay } from "../types";
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

const ICON_SPACING_SINGLE = 0.375;
const ICON_SPACING_DOUBLE = 0.26;
const ICON_SPACING_TRIPLE = 0.19;

enum Modifier {
  DROP = "drop",
  EXPLODE = "explode",
  RE_ROLL = "re-roll",
  MAX = "max",
  MIN = "min",
  TARGET_SUCCESS = "target-success",
  CRITICAL_SUCCESS = "critical-success",
  CRITICAL_FAILURE = "critical-failure",
  PENETRATE = "penetrate",
}

enum IconType {
  TRASHCAN = "trashcan",
  EXPLOSION = "explosion",
  RECYCLE = "recycle",
  CHEVRON_DOWN = "chevronDown",
  CHEVRON_UP = "chevronUp",
  BULLSEYE = "bullseye",
  CRIT = "crit",
  DIZZY_FACE = "dizzyFace",
  ARROW_THROUGH = "arrowThrough",
  BLANK = "blank",
}

const modifierToIconMap = new Map<string, IconType>([
  [Modifier.DROP, IconType.TRASHCAN],
  [Modifier.EXPLODE, IconType.EXPLOSION],
  [Modifier.RE_ROLL, IconType.RECYCLE],
  [Modifier.MAX, IconType.CHEVRON_DOWN],
  [Modifier.MIN, IconType.CHEVRON_UP],
  [Modifier.TARGET_SUCCESS, IconType.BULLSEYE],
  [Modifier.CRITICAL_SUCCESS, IconType.CRIT],
  [Modifier.CRITICAL_FAILURE, IconType.DIZZY_FACE],
  [Modifier.PENETRATE, IconType.ARROW_THROUGH],
]);

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
  ICON_SPACING_SINGLE,
  ICON_SPACING_DOUBLE,
  ICON_SPACING_TRIPLE,
  Modifier,
  IconType,
  modifierToIconMap,
};