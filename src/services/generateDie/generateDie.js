const sharp = require("sharp");
const {
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
  generateD2020
} = require("./dice/d20");
const {
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
  generateD1212
} = require("./dice/d12");
const {
  generateD101,
  generateD102,
  generateD103,
  generateD104,
  generateD105,
  generateD106,
  generateD107,
  generateD108,
  generateD109,
  generateD1010
} = require("./dice/d10");
const {
  generateD81,
  generateD82,
  generateD83,
  generateD84,
  generateD85,
  generateD86,
  generateD87,
  generateD88
} = require("./dice/d8");
const {
  generateD61,
  generateD62,
  generateD63,
  generateD64,
  generateD65,
  generateD66
} = require("./dice/d6");
const {
  generateD41,
  generateD42,
  generateD43,
  generateD44
} = require("./dice/d4");

async function generateDie(sides, number, fill, outline, width, height) {
  const dice = {
    201: generateD201(fill, outline, width, height),
    202: generateD202(fill, outline, width, height),
    203: generateD203(fill, outline, width, height),
    204: generateD204(fill, outline, width, height),
    205: generateD205(fill, outline, width, height),
    206: generateD206(fill, outline, width, height),
    207: generateD207(fill, outline, width, height),
    208: generateD208(fill, outline, width, height),
    209: generateD209(fill, outline, width, height),
    2010: generateD2010(fill, outline, width, height),
    2011: generateD2011(fill, outline, width, height),
    2012: generateD2012(fill, outline, width, height),
    2013: generateD2013(fill, outline, width, height),
    2014: generateD2014(fill, outline, width, height),
    2015: generateD2015(fill, outline, width, height),
    2016: generateD2016(fill, outline, width, height),
    2017: generateD2017(fill, outline, width, height),
    2018: generateD2018(fill, outline, width, height),
    2019: generateD2019(fill, outline, width, height),
    2020: generateD2020(fill, outline, width, height),
    121: generateD121(fill, outline, width, height),
    122: generateD122(fill, outline, width, height),
    123: generateD123(fill, outline, width, height),
    124: generateD124(fill, outline, width, height),
    125: generateD125(fill, outline, width, height),
    126: generateD126(fill, outline, width, height),
    127: generateD127(fill, outline, width, height),
    128: generateD128(fill, outline, width, height),
    129: generateD129(fill, outline, width, height),
    1210: generateD1210(fill, outline, width, height),
    1211: generateD1211(fill, outline, width, height),
    1212: generateD1212(fill, outline, width, height),
    101: generateD101(fill, outline, width, height),
    102: generateD102(fill, outline, width, height),
    103: generateD103(fill, outline, width, height),
    104: generateD104(fill, outline, width, height),
    105: generateD105(fill, outline, width, height),
    106: generateD106(fill, outline, width, height),
    107: generateD107(fill, outline, width, height),
    108: generateD108(fill, outline, width, height),
    109: generateD109(fill, outline, width, height),
    1010: generateD1010(fill, outline, width, height),
    81: generateD81(fill, outline, width, height),
    82: generateD82(fill, outline, width, height),
    83: generateD83(fill, outline, width, height),
    84: generateD84(fill, outline, width, height),
    85: generateD85(fill, outline, width, height),
    86: generateD86(fill, outline, width, height),
    87: generateD87(fill, outline, width, height),
    88: generateD88(fill, outline, width, height),
    61: generateD61(fill, outline, width, height),
    62: generateD62(fill, outline, width, height),
    63: generateD63(fill, outline, width, height),
    64: generateD64(fill, outline, width, height),
    65: generateD65(fill, outline, width, height),
    66: generateD66(fill, outline, width, height),
    41: generateD41(fill, outline, width, height),
    42: generateD42(fill, outline, width, height),
    43: generateD43(fill, outline, width, height),
    44: generateD44(fill, outline, width, height)
  };

  const image = dice[`${sides}${number}`];

  try {
    const attachment = await sharp(new Buffer.from(image)).png().toBuffer();
    return attachment;
  } catch (err) {
    console.error(err);
  }
}

module.exports = generateDie;
