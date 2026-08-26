const DISCORD_SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const ENVIRONMENTS = ["development", "staging", "production"] as const;

type Environment = (typeof ENVIRONMENTS)[number];

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

// SAFETY: The surrounding validation establishes the Environment invariant used below.
function requireEnvironment(value: string | undefined): Environment {
  const environment = requireEnvironmentValue("VITE_ENVIRONMENT", value);
  if (!ENVIRONMENTS.includes(environment as Environment)) {
    throw new Error("VITE_ENVIRONMENT must be development, staging, or production");
  }
  // SAFETY: The surrounding validation establishes the Environment invariant used below.
  return environment as Environment;
}

function requireBuildSha(value: string | undefined): string {
  const buildSha = requireEnvironmentValue("VITE_BUILD_SHA", value);
  if (!FULL_SHA.test(buildSha)) {
    throw new Error("VITE_BUILD_SHA must be a full commit SHA");
  }
  return buildSha;
}

const discordClientId = requireDiscordClientId(
  import.meta.env.VITE_DISCORD_CLIENT_ID,
);

export const appConfig = Object.freeze({
  apiBase: requireHttpUrl("VITE_API_BASE", import.meta.env.VITE_API_BASE),
  discordClientId,
  environment: requireEnvironment(import.meta.env.VITE_ENVIRONMENT),
  buildSha: requireBuildSha(import.meta.env.VITE_BUILD_SHA),
  inviteUrl: `https://discord.com/oauth2/authorize?client_id=${discordClientId}&permissions=0&scope=bot%20applications.commands`,
});
