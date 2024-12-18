import {
  User,
  Message,
  CommandInteraction,
  ButtonInteraction,
  Guild
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { GuildType, UserType } from "../../shared/types";

type UpdateOnCommandParams = {
  commandName: string;
  message?: Message;
  interaction?: CommandInteraction | ButtonInteraction;
};

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private mapGuildToGuildType(guild: Guild): GuildType {
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      approximateMemberCount: guild.approximateMemberCount ?? undefined,
      preferredLocale: guild.preferredLocale,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ?? undefined,
      joinedTimestamp: guild.joinedTimestamp,
    };
  }

  public async upsertGuild(guild: Guild, isARoll: boolean, isActive: boolean = true): Promise<void> {
    const guildData = this.mapGuildToGuildType(guild);

    try {
      await this.prisma.guilds.upsert({
        where: { id: Number(guildData.id) },
        update: {
          name: guildData.name,
          icon: guildData.icon,
          ownerId: Number(guildData.ownerId),
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: Number(guildData.publicUpdatesChannelId),
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? { increment: 1 } : undefined,
          isActive,
        },
        create: {
          id: Number(guildData.id),
          name: guildData.name,
          icon: guildData.icon,
          ownerId: Number(guildData.ownerId),
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: Number(guildData.publicUpdatesChannelId),
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? 1 : 0,
          isActive,
        },
      });
    } catch (err) {
      console.error("Error in upsertGuild:", err);
    }
  }

  private async upsertUser(user: UserType, isARoll: boolean): Promise<void> {
    const { id, username, flags, discriminator, avatar } = user;
    await this.prisma.users.upsert({
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
  }

  private async upsertUserGuildRelationship(guildId: number, userId: number): Promise<void> {
    const relationship = await this.prisma.usersGuilds.findFirst({
      where: { guildId: Number(guildId), userId: Number(userId) },
    });
    if (!relationship) {
      await this.prisma.usersGuilds.create({
        data: { guildId: Number(guildId), userId: Number(userId) },
      });
    }
  }

  private mapUserToUserType(user: User): UserType {
    return {
      id: user.id,
      username: user.username,
      flags: user.flags ? { bitfield: user.flags.bitfield } : undefined,
      discriminator: user.discriminator,
      avatar: user.avatar ?? undefined,
    };
  }

  public async updateOnCommand({ commandName, message, interaction }: UpdateOnCommandParams): Promise<void> {
    const isARoll = ["r", "roll"].includes(commandName);

    try {
      if (message) {
        const { author, guild } = message;
        await this.upsertUser(this.mapUserToUserType(author), isARoll);

        if (guild) {
          await this.upsertGuild(guild, isARoll);
          await this.upsertUserGuildRelationship(Number(guild.id), Number(author.id));
        }
      } else if (interaction) {
        const { user, guild } = interaction;
        await this.upsertUser(this.mapUserToUserType(user), isARoll);

        if (guild) {
          await this.upsertGuild(guild, isARoll);
          await this.upsertUserGuildRelationship(Number(guild.id), Number(user.id));
        }
      }
    } catch (err) {
      console.error("Error in updateOnCommand:", err);
    }
  }

}