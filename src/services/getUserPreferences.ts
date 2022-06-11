import { GetUserPreferencesProps } from "../types";

const getPreferences = async ({
  prisma,
  message,
  interaction,
}: GetUserPreferencesProps) => {
  if (message) {
    const {
      author: { id },
    } = message;
    console.log(id);
    const preferences = await prisma.usersPreferences.findFirst({
      where: {
        userId: Number(id),
      },
    });
    const { id: idParam, userId, ...toReturn } = preferences || {};
    return toReturn;

  } else if (interaction) {
    const {
      user: { id },
    } = interaction
    console.log(id);
    console.log(prisma);
    const preferences = await prisma.usersPreferences.findFirst({
      where: {
        userId: Number(id),
      },
    });
    const { id: idParam, userId, ...toReturn } = preferences || {};
    return toReturn;
  }
};

export default getPreferences;
