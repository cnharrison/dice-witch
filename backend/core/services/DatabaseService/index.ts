import {
  User,
  Guild,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { GuildType, UserType } from "../../../shared/types";

import { updateOnCommand } from "./methods/updateOnCommand";
import { updateGuild } from "./methods/updateGuild";
import { getMutualGuilds } from "./methods/getMutualGuilds";
import { getMutualGuildsWithPermissions } from "./methods/getMutualGuildsWithPermissions";
import { getGuildSettings } from "./methods/getGuildSettings";
import { updateGuildPreferences } from "./methods/updateGuildPreferences";
import { updateUserGuildPermissions } from "./methods/updateUserGuildPermissions";

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  protected readonly processedInteractions: Set<string>;
  public prisma: PrismaClient;
  protected cleanupInteractionsInterval: NodeJS.Timeout;

  private constructor() {
    this.prisma = new PrismaClient();
    this.processedInteractions = new Set<string>();
    
    this.cleanupInteractionsInterval = setInterval(() => this.cleanupOldInteractions(), 10 * 60 * 1000);
    if (this.cleanupInteractionsInterval.unref) {
      this.cleanupInteractionsInterval.unref();
    }
  }
  
  public async destroy() {
    if (this.cleanupInteractionsInterval) {
      clearInterval(this.cleanupInteractionsInterval);
    }
    
    this.processedInteractions.clear();
    
    await this.prisma.$disconnect();
  }
  
  protected cleanupOldInteractions() {
    if (this.processedInteractions.size > 250) {
      const toRemove = Array.from(this.processedInteractions).slice(0, this.processedInteractions.size - 250);
      toRemove.forEach(id => this.processedInteractions.delete(id));
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }
  
  public async testConnection(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public mapGuildToGuildType(guild: Guild): GuildType {
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

  protected mapUserToUserType(user: User): UserType {
    return {
      id: user.id,
      username: user.username,
      flags: user.flags ? { bitfield: user.flags.bitfield } : undefined,
      discriminator: user.discriminator,
      avatar: user.avatar ?? undefined,
    };
  }

  // Bind method implementations
  public updateOnCommand = updateOnCommand;
  public updateGuild = updateGuild;
  public getMutualGuilds = getMutualGuilds;
  public getMutualGuildsWithPermissions = getMutualGuildsWithPermissions;
  public getGuildSettings = getGuildSettings;
  public updateGuildPreferences = updateGuildPreferences;
  public updateUserGuildPermissions = updateUserGuildPermissions;
}

export default DatabaseService;