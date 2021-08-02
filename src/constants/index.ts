import { ColorResolvable } from "discord.js";
import { DiceTypesToDisplay } from "../types";

const availableDice: DiceTypesToDisplay[] = [100, 20, 12, 10, 8, 6, 4];

const maxDice: number = 50;

const eventColor: ColorResolvable = "#99999";
const errorColor: ColorResolvable = "#FF0000";
const goodColor: ColorResolvable = "#00FF00";
const infoColor: ColorResolvable = "#1E90FF";

export { availableDice, maxDice, eventColor, errorColor, goodColor, infoColor };
