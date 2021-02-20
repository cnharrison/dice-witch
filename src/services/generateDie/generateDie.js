const { svg2png } = require("svg-png-converter");
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

const generateDie = async (sides, number, fill, outline, width, height) => {
  let image;
  switch (true) {
    case sides === 20 && number === 1:
      image = generateD201(fill, outline, width, height);
      break;
    case sides === 20 && number === 2:
      image = generateD202(fill, outline, width, height);
      break;
    case sides === 20 && number === 3:
      image = generateD203(fill, outline, width, height);
      break;
    case sides === 20 && number === 4:
      image = generateD204(fill, outline, width, height);
      break;
    case sides === 20 && number === 5:
      image = generateD205(fill, outline, width, height);
      break;
    case sides === 20 && number === 6:
      image = generateD206(fill, outline, width, height);
      break;
    case sides === 20 && number === 7:
      image = generateD207(fill, outline, width, height);
      break;
    case sides === 20 && number === 8:
      image = generateD208(fill, outline, width, height);
      break;
    case sides === 20 && number === 9:
      image = generateD209(fill, outline, width, height);
      break;
    case sides === 20 && number === 10:
      image = generateD2010(fill, outline, width, height);
      break;
    case sides === 20 && number === 11:
      image = generateD2011(fill, outline, width, height);
      break;
    case sides === 20 && number === 12:
      image = generateD2012(fill, outline, width, height);
      break;
    case sides === 20 && number === 13:
      image = generateD2013(fill, outline, width, height);
      break;
    case sides === 20 && number === 14:
      image = generateD2014(fill, outline, width, height);
      break;
    case sides === 20 && number === 15:
      image = generateD2015(fill, outline, width, height);
      break;
    case sides === 20 && number === 16:
      image = generateD2016(fill, outline, width, height);
      break;
    case sides === 20 && number === 17:
      image = generateD2017(fill, outline, width, height);
      break;
    case sides === 20 && number === 18:
      image = generateD2018(fill, outline, width, height);
      break;
    case sides === 20 && number === 19:
      image = generateD2019(fill, outline, width, height);
      break;
    case sides === 20 && number === 20:
      image = generateD2020(fill, outline, width, height);
      break;
    case sides === 12 && number === 1:
      image = generateD121(fill, outline, width, height);
      break;
    case sides === 12 && number === 2:
      image = generateD122(fill, outline, width, height);
      break;
    case sides === 12 && number === 3:
      image = generateD123(fill, outline, width, height);
      break;
    case sides === 12 && number === 4:
      image = generateD124(fill, outline, width, height);
      break;
    case sides === 12 && number === 5:
      image = generateD125(fill, outline, width, height);
      break;
    case sides === 12 && number === 6:
      image = generateD126(fill, outline, width, height);
      break;
    case sides === 12 && number === 7:
      image = generateD127(fill, outline, width, height);
      break;
    case sides === 12 && number === 8:
      image = generateD128(fill, outline, width, height);
      break;
    case sides === 12 && number === 9:
      image = generateD129(fill, outline, width, height);
      break;
    case sides === 12 && number === 10:
      image = generateD1210(fill, outline, width, height);
      break;
    case sides === 12 && number === 11:
      image = generateD1211(fill, outline, width, height);
      break;
    case sides === 12 && number === 12:
      image = generateD1212(fill, outline, width, height);
      break;
    case sides === 10 && number === 1:
      image = generateD101(fill, outline, width, height);
      break;
    case sides === 10 && number === 2:
      image = generateD102(fill, outline, width, height);
      break;
    case sides === 10 && number === 3:
      image = generateD103(fill, outline, width, height);
      break;
    case sides === 10 && number === 4:
      image = generateD104(fill, outline, width, height);
      break;
    case sides === 10 && number === 5:
      image = generateD105(fill, outline, width, height);
      break;
    case sides === 10 && number === 6:
      image = generateD106(fill, outline, width, height);
      break;
    case sides === 10 && number === 7:
      image = generateD107(fill, outline, width, height);
      break;
    case sides === 10 && number === 8:
      image = generateD108(fill, outline, width, height);
      break;
    case sides === 10 && number === 9:
      image = generateD109(fill, outline, width, height);
      break;
    case sides === 10 && number === 10:
      image = generateD1010(fill, outline, width, height);
      break;
    case sides === 8 && number === 1:
      image = generateD81(fill, outline, width, height);
      break;
    case sides === 8 && number === 2:
      image = generateD82(fill, outline, width, height);
      break;
    case sides === 8 && number === 3:
      image = generateD83(fill, outline, width, height);
      break;
    case sides === 8 && number === 4:
      image = generateD84(fill, outline, width, height);
      break;
    case sides === 8 && number === 5:
      image = generateD85(fill, outline, width, height);
      break;
    case sides === 8 && number === 6:
      image = generateD86(fill, outline, width, height);
      break;
    case sides === 8 && number === 7:
      image = generateD87(fill, outline, width, height);
      break;
    case sides === 8 && number === 8:
      image = generateD88(fill, outline, width, height);
      break;
    case sides === 6 && number === 1:
      image = generateD61(fill, outline, width, height);
      break;
    case sides === 6 && number === 2:
      image = generateD62(fill, outline, width, height);
      break;
    case sides === 6 && number === 3:
      image = generateD63(fill, outline, width, height);
      break;
    case sides === 6 && number === 4:
      image = generateD64(fill, outline, width, height);
      break;
    case sides === 6 && number === 5:
      image = generateD65(fill, outline, width, height);
      break;
    case sides === 6 && number === 6:
      image = generateD66(fill, outline, width, height);
      break;
    case sides === 4 && number === 1:
      image = generateD41(fill, outline, width, height);
      break;
    case sides === 4 && number === 2:
      image = generateD42(fill, outline, width, height);
      break;
    case sides === 4 && number === 3:
      image = generateD43(fill, outline, width, height);
      break;
    case sides === 4 && number === 4:
      image = generateD44(fill, outline, width, height);
      break;
    default:
      return null;
  }
  return await svg2png({
    input: image,
    encoding: "buffer",
    format: "png"
  });
};

module.exports = generateDie;
