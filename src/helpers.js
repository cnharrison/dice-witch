const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getRandomColor = () => {
  switch (getRandomNumber(5)) {
    case 1:
      return "red";
    case 2:
      return "orange";
    case 2:
      return "yellow";
    case 3:
      return "green";
    case 4:
      return "blue";
    case 5:
      return "purple";
    default:
      return "red";
  }
};

module.exports = { getRandomColor, getRandomNumber };
