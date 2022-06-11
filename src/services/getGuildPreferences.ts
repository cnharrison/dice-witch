import { GetUserPreferencesProps } from "../types";

const getPreferences = async ({
  prisma,
  message,
  interaction,
}: GetUserPreferencesProps) => {
  if (message) {
    const {
      guild
    } = message;
    console.log(JSON.stringify(guild?.me?.permissions, null, 2));
    // const preferences = await prisma.guildsPreferences.findFirst({
    //   where: {
    //     userId: Number(id),
    //   },
    // });
    // const { id: idParam, userId, ...toReturn } = preferences || {};
    // return toReturn;
  } else if (interaction) {
    const {
      user: { id },
    } = interaction;
    // const preferences = await prisma.guildsPreferences.findFirst({
    //   where: {
    //     id: Number(id),
    //   },
    // });
    // const { id: idParam, userId, ...toReturn } = preferences || {};
    // return toReturn;
  }
};

export default getPreferences;