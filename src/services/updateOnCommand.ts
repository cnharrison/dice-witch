import { UpdateOnCommandProps } from "../types";

const updateOnCommand = async ({
  prisma,
  commandName,
  message,
  interaction,
}: UpdateOnCommandProps) => {
  if (message) {
    const {
      author: { id, username, flags, discriminator, avatar },
    } = message;

    try {
      await prisma.users.upsert({
        where: {
          id: Number(id),
        },
        update: {
          username,
          avatar,
          flags: flags?.bitfield,
          discriminator: Number(discriminator),
          rollCount: { increment: 1 },
        },
        create: {
          id: Number(id),
          username,
          avatar,
          flags: flags?.bitfield,
          discriminator: Number(discriminator),
          rollCount: 1,
        },
      });
    } catch (err) {
      console.error(err);
    }

    if (message.guild) {
      const {
        author: { id: authorId },
        guild: {
          id,
          name,
          icon,
          ownerId,
          memberCount,
          approximateMemberCount,
          preferredLocale,
          publicUpdatesChannelId,
          joinedTimestamp,
        },
      } = message;

      const isARoll = ["r", "roll", "tr", "titledroll"].includes(commandName);
      try {
        await prisma.guilds.upsert({
          where: {
            id: Number(id),
          },
          update: {
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: isARoll ? { increment: 1 } : undefined,
          },
          create: {
            id: Number(id),
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: isARoll ? 1 : undefined,
          },
        });

        const relationship = await prisma.usersGuilds.findFirst({
          where: {
            guildId: Number(id),
            userId: Number(authorId),
          },
        });
        if (!relationship) {
          await prisma.usersGuilds.create({
            data: {
              guildId: Number(id),
              userId: Number(authorId),
            },
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
  } else if (interaction) {
    const {
      user: { id, username, flags, discriminator, avatar },
    } = interaction;
    const isARoll = commandName === "roll";
    try {
      await prisma.users.upsert({
        where: {
          id: Number(id),
        },
        update: {
          username,
          avatar,
          flags: flags?.bitfield,
          discriminator: Number(discriminator),
          rollCount: isARoll ? { increment: 1 } : undefined,
        },
        create: {
          id: Number(id),
          username,
          avatar,
          flags: flags?.bitfield,
          discriminator: Number(discriminator),
          rollCount: isARoll ? 1 : undefined,
        },
      });
    } catch (err) {
      console.error(err);
    }

    if (interaction.guild) {
      const {
        user: { id: authorId },
        guild: {
          id,
          name,
          icon,
          ownerId,
          memberCount,
          approximateMemberCount,
          preferredLocale,
          publicUpdatesChannelId,
          joinedTimestamp,
        },
      } = interaction;
      try {
        await prisma.guilds.upsert({
          where: {
            id: Number(id),
          },
          update: {
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: isARoll ? { increment: 1 } : undefined,
          },
          create: {
            id: Number(id),
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: isARoll ? 1 : undefined,
          },
        });

        const relationship = await prisma.usersGuilds.findFirst({
          where: {
            guildId: Number(id),
            userId: Number(authorId),
          },
        });
        if (!relationship) {
          await prisma.usersGuilds.create({
            data: {
              guildId: Number(id),
              userId: Number(authorId),
            },
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
};

export default updateOnCommand;
