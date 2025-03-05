import {
  Client,
  ShardingManager
} from "discord.js";

import { checkForAttachPermission } from "./methods/checkForAttachPermission";
import { checkAndStorePermissions } from "./methods/checkAndStorePermissions";
import { getShardStatus } from "./methods/getShardStatus";
import { getUserCount } from "./methods/getUserCount";
import { getTextChannels } from "./methods/getTextChannels";
import { getChannel } from "./methods/getChannel";
import { sendMessage } from "./methods/sendMessage";

export class DiscordService {
  private static instance: DiscordService;
  protected client!: Client;
  protected manager!: ShardingManager;
  protected handledInteractions = new Map<string, NodeJS.Timeout>();
  protected readonly MAX_INTERACTIONS = 1000;
  protected cleanupInterval: NodeJS.Timeout;

  private constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupOldInteractions(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
  
  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.handledInteractions.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.handledInteractions.clear();
  }

  public static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  public setClient(client: Client) {
    this.client = client;
  }

  public setManager(manager: ShardingManager) {
    this.manager = manager;
  }

  public getClient(): Client {
    return this.client;
  }

  public getManager(): ShardingManager {
    return this.manager;
  }

  protected getStatusText(status: number): string {
    switch (status) {
      case 0: return "Connecting";
      case 1: return "Online";
      case 2: return "Closing";
      case 3: return "Closed";
      default: return "Unknown";
    }
  }

  protected cleanupOldInteractions() {
    if (this.handledInteractions.size > this.MAX_INTERACTIONS) {
      const keysToDelete = [...this.handledInteractions.keys()].slice(0, this.handledInteractions.size - this.MAX_INTERACTIONS);
      for (const key of keysToDelete) {
        const timeout = this.handledInteractions.get(key);
        if (timeout) {
          clearTimeout(timeout);
        }
        this.handledInteractions.delete(key);
      }
    }
  }

  public trackInteraction(interactionId: string) {
    const existingTimeout = this.handledInteractions.get(interactionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      this.handledInteractions.delete(interactionId);
    }, 15_000);
    
    if (timeoutId.unref) {
      timeoutId.unref();
    }
    
    this.handledInteractions.set(interactionId, timeoutId);
  }

  // Bind method implementations
  public checkForAttachPermission = checkForAttachPermission;
  public checkAndStorePermissions = checkAndStorePermissions;
  public getShardStatus = getShardStatus;
  public getUserCount = getUserCount;
  public getTextChannels = getTextChannels;
  public getChannel = getChannel;
  public sendMessage = sendMessage;
}

export default DiscordService;