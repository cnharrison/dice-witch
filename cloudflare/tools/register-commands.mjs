import { DISCORD_GLOBAL_COMMANDS } from "../packages/discord-contracts/src/commands.ts";

const snowflake = /^[1-9][0-9]{16,19}$/;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_COMMAND_GUILD_ID;

if (!applicationId || !snowflake.test(applicationId)) {
  throw new Error("DISCORD_APPLICATION_ID must be a valid Discord application ID");
}
if (!botToken || botToken.trim() !== botToken || botToken.length < 50) {
  throw new Error("DISCORD_BOT_TOKEN is missing or invalid");
}
if (guildId !== undefined && !snowflake.test(guildId)) {
  throw new Error("DISCORD_COMMAND_GUILD_ID must be a valid Discord guild ID");
}

const scope = guildId === undefined ? "global" : "guild";
const path =
  guildId === undefined
    ? `/applications/${applicationId}/commands`
    : `/applications/${applicationId}/guilds/${guildId}/commands`;
const response = await fetch(`https://discord.com/api/v10${path}`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${botToken}`,
    "content-type": "application/json",
    "user-agent": "Dice-Witch-Command-Registration",
  },
  body: JSON.stringify(DISCORD_GLOBAL_COMMANDS),
});

if (!response.ok) {
  throw new Error(`Discord command registration failed with HTTP ${response.status}`);
}

const result = await response.json();
if (!Array.isArray(result) || result.length !== DISCORD_GLOBAL_COMMANDS.length) {
  throw new Error("Discord returned an unexpected command registration response");
}

console.log(`Registered ${result.length} ${scope} Discord commands.`);
