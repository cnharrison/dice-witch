import { DatabaseService } from "..";

export async function updateGuildPreferences(
  this: DatabaseService,
  guildId: string, 
  preferences: {
    skipDiceDelay?: boolean;
  }
): Promise<void> {
  try {
    await this.prisma.guilds.update({
      where: { id: guildId },
      data: {
        skipDiceDelay: preferences.skipDiceDelay
      }
    });
  } catch (error) {
    console.error("Error updating guild preferences:", error);
    throw error;
  }
}