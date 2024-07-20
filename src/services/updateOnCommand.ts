import { User } from "discord.js";
import { UpdateOnCommandProps, GuildType, UserType } from "../types";
import { PrismaClient } from "@prisma/client";

const upsertUser = async (prisma: PrismaClient, user: UserType, isARoll: boolean) => {
  const { id, username, flags, discriminator, avatar } = user;
  await prisma.users.upsert({
    where: { id: Number(id) },
    update: {
      username,
      avatar,
      flags: flags ? flags.bitfield : undefined,
      discriminator: Number(discriminator),
      rollCount: isARoll ? { increment: 1 } : undefined,
    },
    create: {
      id: Number(id),
      username,
      avatar,
      flags: flags ? flags.bitfield : undefined,
      discriminator: Number(discriminator),
      rollCount: isARoll ? 1 : undefined,
    },
  });
};

const upsertGuild = async (prisma: PrismaClient, guild: GuildType, isARoll: boolean) => {
  const {
    id,
    name,
    icon,
    ownerId,
    memberCount,
    approximateMemberCount,
    preferredLocale,
    publicUpdatesChannelId,
    joinedTimestamp,
  } = guild;
  await prisma.guilds.upsert({
    where: { id: Number(id) },
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
      approximateMemberCount: approximateMemberCount ?? undefined,
      preferredLocale,
      publicUpdatesChannelId: Number(publicUpdatesChannelId),
      joinedTimestamp,
      rollCount: isARoll ? 1 : undefined,
    },
  });
};

const upsertUserGuildRelationship = async (prisma: PrismaClient, guildId: number, userId: number) => {
  const relationship = await prisma.usersGuilds.findFirst({
    where: { guildId: Number(guildId), userId: Number(userId) },
  });
  if (!relationship) {
    await prisma.usersGuilds.create({
      data: { guildId: Number(guildId), userId: Number(userId) },
    });
  }
};

const mapUserToUserType = (user: User): UserType => ({
  id: user.id,
  username: user.username,
  flags: user.flags ? { bitfield: user.flags.bitfield } : undefined,
  discriminator: user.discriminator,
  avatar: user.avatar ?? undefined,
});

const updateOnCommand = async ({
  prisma,
  commandName,
  message,
  interaction,
}: UpdateOnCommandProps) => {
  const isARoll = ["r", "roll"].includes(commandName);

  try {
    if (message) {
      const { author, guild } = message;
      await upsertUser(prisma, mapUserToUserType(author), isARoll);

      if (guild) {
        const guildData: GuildType = {
          ...guild,
          approximateMemberCount: guild.approximateMemberCount ?? undefined,
          publicUpdatesChannelId: guild.publicUpdatesChannelId ?? undefined,
        };
        await upsertGuild(prisma, guildData, isARoll);
        await upsertUserGuildRelationship(prisma, Number(guild.id), Number(author.id));
      }
    } else if (interaction) {
      const { user, guild } = interaction;
      await upsertUser(prisma, mapUserToUserType(user), isARoll);

      if (guild) {
        const guildData: GuildType = {
          ...guild,
          approximateMemberCount: guild.approximateMemberCount ?? undefined,
          publicUpdatesChannelId: guild.publicUpdatesChannelId ?? undefined,
        };
        await upsertGuild(prisma, guildData, isARoll);
        await upsertUserGuildRelationship(prisma, Number(guild.id), Number(user.id));
      }
    }
  } catch (err) {
    console.error(err);
  }
};

export default updateOnCommand;