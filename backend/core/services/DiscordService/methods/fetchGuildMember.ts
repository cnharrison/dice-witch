import { GuildMember } from "discord.js";
import { DiscordService } from "..";

export async function fetchGuildMember(
  this: DiscordService,
  member?: GuildMember | null
): Promise<GuildMember | null> {
  if (!member) return null;

  // fetch on miss because caches are intentionally limited
  if (member.partial && typeof member.fetch === "function") {
    return await member.fetch().catch(() => member);
  }

  if (member.roles?.cache?.size === 0 && typeof member.fetch === "function") {
    return await member.fetch().catch(() => member);
  }

  return member;
}
