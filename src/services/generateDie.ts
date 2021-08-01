import { DiceFaceData, DiceTypes, DiceFaces } from "../types";
import sharp from "sharp";
import {
  generateD201,
  generateD202,
  generateD203,
  generateD204,
  generateD205,
  generateD206,
  generateD207,
  generateD208,
  generateD209,
  generateD2010,
  generateD2011,
  generateD2012,
  generateD2013,
  generateD2014,
  generateD2015,
  generateD2016,
  generateD2017,
  generateD2018,
  generateD2019,
  generateD2020,
} from "./generateDice/d20";
import {
  generateD121,
  generateD122,
  generateD123,
  generateD124,
  generateD125,
  generateD126,
  generateD127,
  generateD128,
  generateD129,
  generateD1210,
  generateD1211,
  generateD1212,
} from "./generateDice/d12";
import {
  generateD101,
  generateD102,
  generateD103,
  generateD104,
  generateD105,
  generateD106,
  generateD107,
  generateD108,
  generateD109,
  generateD1010,
} from "./generateDice/d10";
import {
  generateD81,
  generateD82,
  generateD83,
  generateD84,
  generateD85,
  generateD86,
  generateD87,
  generateD88,
} from "./generateDice/d8";
import {
  generateD61,
  generateD62,
  generateD63,
  generateD64,
  generateD65,
  generateD66,
} from "./generateDice/d6";
import {
  generateD41,
  generateD42,
  generateD43,
  generateD44,
} from "./generateDice/d4";
import {
  generateDPercent0,
  generateDPercent10,
  generateDPercent20,
  generateDPercent30,
  generateDPercent40,
  generateDPercent50,
  generateDPercent60,
  generateDPercent70,
  generateDPercent80,
  generateDPercent90,
} from "./generateDice/d%";

const generateDie = async (
  sides: DiceTypes,
  number: DiceFaces,
  fill: string,
  outline: string,
  width?: string,
  height?: string
) => {
  const dice: DiceFaceData = {
    20: {
      1: generateD201(fill, outline, width, height),
      2: generateD202(fill, outline, width, height),
      3: generateD203(fill, outline, width, height),
      4: generateD204(fill, outline, width, height),
      5: generateD205(fill, outline, width, height),
      6: generateD206(fill, outline, width, height),
      7: generateD207(fill, outline, width, height),
      8: generateD208(fill, outline, width, height),
      9: generateD209(fill, outline, width, height),
      10: generateD2010(fill, outline, width, height),
      11: generateD2011(fill, outline, width, height),
      12: generateD2012(fill, outline, width, height),
      13: generateD2013(fill, outline, width, height),
      14: generateD2014(fill, outline, width, height),
      15: generateD2015(fill, outline, width, height),
      16: generateD2016(fill, outline, width, height),
      17: generateD2017(fill, outline, width, height),
      18: generateD2018(fill, outline, width, height),
      19: generateD2019(fill, outline, width, height),
      20: generateD2020(fill, outline, width, height),
    },
    12: {
      1: generateD121(fill, outline, width, height),
      2: generateD122(fill, outline, width, height),
      3: generateD123(fill, outline, width, height),
      4: generateD124(fill, outline, width, height),
      5: generateD125(fill, outline, width, height),
      6: generateD126(fill, outline, width, height),
      7: generateD127(fill, outline, width, height),
      8: generateD128(fill, outline, width, height),
      9: generateD129(fill, outline, width, height),
      10: generateD1210(fill, outline, width, height),
      11: generateD1211(fill, outline, width, height),
      12: generateD1212(fill, outline, width, height),
    },
    10: {
      1: generateD101(fill, outline, width, height),
      2: generateD102(fill, outline, width, height),
      3: generateD103(fill, outline, width, height),
      4: generateD104(fill, outline, width, height),
      5: generateD105(fill, outline, width, height),
      6: generateD106(fill, outline, width, height),
      7: generateD107(fill, outline, width, height),
      8: generateD108(fill, outline, width, height),
      9: generateD109(fill, outline, width, height),
      10: generateD1010(fill, outline, width, height),
    },
    8: {
      1: generateD81(fill, outline, width, height),
      2: generateD82(fill, outline, width, height),
      3: generateD83(fill, outline, width, height),
      4: generateD84(fill, outline, width, height),
      5: generateD85(fill, outline, width, height),
      6: generateD86(fill, outline, width, height),
      7: generateD87(fill, outline, width, height),
      8: generateD88(fill, outline, width, height),
    },
    6: {
      1: generateD61(fill, outline, width, height),
      2: generateD62(fill, outline, width, height),
      3: generateD63(fill, outline, width, height),
      4: generateD64(fill, outline, width, height),
      5: generateD65(fill, outline, width, height),
      6: generateD66(fill, outline, width, height),
    },
    4: {
      1: generateD41(fill, outline, width, height),
      2: generateD42(fill, outline, width, height),
      3: generateD43(fill, outline, width, height),
      4: generateD44(fill, outline, width, height),
    },
    "%": {
      0: generateDPercent0(fill, outline, width, height),
      10: generateDPercent10(fill, outline, width, height),
      20: generateDPercent20(fill, outline, width, height),
      30: generateDPercent30(fill, outline, width, height),
      40: generateDPercent40(fill, outline, width, height),
      50: generateDPercent50(fill, outline, width, height),
      60: generateDPercent60(fill, outline, width, height),
      70: generateDPercent70(fill, outline, width, height),
      80: generateDPercent80(fill, outline, width, height),
      90: generateDPercent90(fill, outline, width, height),
    },
  };

  const image = dice[sides][number];

  try {
    const attachment = await sharp(new (Buffer as any).from(image))
      .png()
      .toBuffer();
    return attachment;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export default generateDie;
