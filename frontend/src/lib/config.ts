const DISCORD_SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

function requireEnvironmentValue(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function requireHttpUrl(name: string, value: string | undefined): string {
  const configured = requireEnvironmentValue(name, value);
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return url.toString().replace(/\/$/, "");
}

function requireDiscordClientId(value: string | undefined): string {
  const clientId = requireEnvironmentValue("VITE_DISCORD_CLIENT_ID", value);
  if (!DISCORD_SNOWFLAKE.test(clientId)) {
    throw new Error("VITE_DISCORD_CLIENT_ID must be a Discord Snowflake");
  }
  return clientId;
}

const discordClientId = requireDiscordClientId(
  import.meta.env.VITE_DISCORD_CLIENT_ID,
);

export const appConfig = Object.freeze({
  apiBase: requireHttpUrl("VITE_API_BASE", import.meta.env.VITE_API_BASE),
  discordClientId,
  inviteUrl: `https://discord.com/oauth2/authorize?client_id=${discordClientId}&permissions=0&scope=bot%20applications.commands`,
});
