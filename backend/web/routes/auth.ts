import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { CONFIG } from "../../config";
import { DatabaseService } from "../../core/services/DatabaseService";
import { DiscordService } from "../../core/services/DiscordService";

const isProduction = process.env.NODE_ENV === "production";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 10000;

const auth = new Hono();

type DiscordTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

type DiscordUserProfile = {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
};

type DiscordGuild = {
  id: string;
  name: string;
  permissions: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  discordId: string;
};

export type SessionData = {
  user: SessionUser;
  expires: string;
  accessToken: string;
};

export type SessionRecord = {
  session: SessionData;
  expires: number;
};

const discordProvider = {
  id: "discord",
  clientId: CONFIG.discord.clientId,
  clientSecret: CONFIG.discord.clientSecret,
  authorization: {
    url: "https://discord.com/api/oauth2/authorize",
    params: {
      scope: "identify email guilds",
    },
  },
  token: {
    url: "https://discord.com/api/oauth2/token",
  },
  userinfo: {
    url: "https://discord.com/api/users/@me",
  },
};

export const sessions = new Map<string, SessionRecord>();

const cleanupSessions = () => {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (value.expires <= now) {
      sessions.delete(key);
    }
  }
  if (sessions.size > MAX_SESSIONS) {
    const entries = Array.from(sessions.entries()).sort((a, b) => a[1].expires - b[1].expires);
    for (const [key] of entries) {
      if (sessions.size <= MAX_SESSIONS) break;
      sessions.delete(key);
    }
  }
};

const sessionCleanupInterval = setInterval(cleanupSessions, 10 * 60 * 1000);
if (sessionCleanupInterval.unref) {
  sessionCleanupInterval.unref();
}

function generateRandomString(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
auth.get("/session", async (c) => {
  const sessionId = getCookie(c, "session_id");
  
  const record = sessionId ? sessions.get(sessionId) : null;
  if (!record || record.expires <= Date.now()) {
    if (sessionId) {
      sessions.delete(sessionId);
    }
    return c.json({ user: null }, 401);
  }
  
  return c.json(record.session);
});


auth.get("/signin/:provider", async (c) => {
  const provider = c.req.param("provider");
  
  if (provider !== "discord") {
    return c.json({ error: "Provider not supported" }, 400);
  }
  
  const authUrl = new URL(discordProvider.authorization.url);
  const clientId = CONFIG.discord.clientId || "809202086083428394";
  const redirectUri = isProduction ? "https://dicewit.ch/api/auth/callback/discord" : "http://localhost";
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: discordProvider.authorization.params.scope,
  });
  
  const state = generateRandomString(32);
  setCookie(c, "auth_state", state, {
    httpOnly: true,
    secure: isProduction,
    path: "/",
    maxAge: 60 * 10,
  });
  
  params.append("state", state);
  authUrl.search = params.toString();
  
  return c.redirect(authUrl.toString());
});

auth.get("/callback/:provider", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, "auth_state");
  
  if (!state || !savedState || state !== savedState) {
    return c.json({ error: "Invalid state" }, 400);
  }
  
  if (!code) {
    return c.json({ error: "No code provided" }, 400);
  }
  
  try {
    const tokenUrl = "https://discord.com/api/oauth2/token";
    const clientId = CONFIG.discord.clientId || "809202086083428394";
    
    if (!CONFIG.discord.clientSecret) {
      return c.json({ error: "Discord client secret is not configured" }, 500);
    }
    
    const redirectUri = isProduction ? "https://dicewit.ch/api/auth/callback/discord" : "http://localhost";
    
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: CONFIG.discord.clientSecret || "",
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams.toString(),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange error:", error);
      return c.json({ error: "Failed to exchange code for token" }, 500);
    }
    
    const tokens = (await tokenResponse.json()) as DiscordTokenResponse;
    
    // Get user profile
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    
    if (!userResponse.ok) {
      return c.json({ error: "Failed to fetch user profile" }, 500);
    }
    
    const profile = (await userResponse.json()) as DiscordUserProfile;
    
    // Create session
    const userId = profile.id;
    const sessionId = generateRandomString(32);
    
    const user: SessionUser = {
      id: userId,
      name: profile.username,
      email: profile.email,
      image: profile.avatar 
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null,
      discordId: profile.id,
    };
    
    const session = {
      user,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessToken: tokens.access_token,
    };
    
    const expires = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionId, { session, expires });
    
    setCookie(c, "session_id", sessionId, {
      httpOnly: false,
      secure: isProduction,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
      domain: isProduction ? "dicewit.ch" : undefined
    });
    
    try {
      const dbService = DatabaseService.getInstance();
      await dbService.prisma.users.upsert({
        where: { id: userId },
        update: { 
          username: profile.username,
          email: profile.email,
          avatar: profile.avatar,
          lastWebLogin: new Date(),
        },
        create: {
          id: userId,
          username: profile.username,
          email: profile.email,
          avatar: profile.avatar,
          lastWebLogin: new Date(),
        },
      });
    } catch (error) {
    }

    try {
      const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (guildsResponse.ok) {
        const guilds = (await guildsResponse.json()) as DiscordGuild[];
        const discordService = DiscordService.getInstance();
        const dbService = DatabaseService.getInstance();

        for (const guild of guilds) {
          const result = await discordService.getGuildMemberPermissions(guild.id, userId);
          if (!result?.permissions || !result.guild) {
            continue;
          }

          await dbService.updateGuild({
            id: result.guild.id,
            name: result.guild.name,
            icon: result.guild.icon ?? undefined,
            ownerId: result.guild.ownerId,
            memberCount: result.guild.memberCount,
            approximateMemberCount: result.guild.approximateMemberCount ?? undefined,
            preferredLocale: result.guild.preferredLocale,
            publicUpdatesChannelId: result.guild.publicUpdatesChannelId ?? undefined,
            joinedTimestamp: result.guild.joinedTimestamp,
          }, false, true);

          await dbService.updateUserGuildPermissions({
            userId,
            guildId: result.guild.id,
            isAdmin: result.permissions.isAdmin,
            isDiceWitchAdmin: result.permissions.isDiceWitchAdmin,
          });
        }
      } else {
        console.warn("[Auth] Failed to fetch Discord guilds for permission sync:", {
          status: guildsResponse.status,
          userId,
        });
      }
    } catch (error) {
      console.warn("[Auth] Failed to sync Discord guild permissions on login:", error);
    }
    
    setCookie(c, "auth_state", "", {
      httpOnly: true,
      secure: isProduction,
      path: "/",
      maxAge: 0,
    });
    
    const frontendUrl = isProduction ? 'https://dicewit.ch' : 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/app`);
  } catch (error) {
    return c.json({ error: "Authentication failed" }, 500);
  }
});

auth.post("/signout", async (c) => {
  const sessionId = getCookie(c, "session_id");
  
  if (sessionId) {
    sessions.delete(sessionId);
    setCookie(c, "session_id", "", {
      httpOnly: true,
      secure: isProduction,
      path: "/",
      maxAge: 0,
    });
  }
  
  return c.json({ success: true });
});

export default auth;
