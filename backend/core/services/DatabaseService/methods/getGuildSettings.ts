import { DatabaseService } from "..";

export async function getGuildSettings(
  this: DatabaseService,
  guildId: string
): Promise<{
  skipDiceDelay: boolean;
}> {
  try {
    const guild = await this.prisma.guilds.findUnique({
      where: { id: guildId }
    });

    return {
      skipDiceDelay: guild?.skipDiceDelay ?? false
    };
  } catch (error) {
    console.error("Error retrieving guild settings:", error);
    return {
      skipDiceDelay: false
    };
  }
}