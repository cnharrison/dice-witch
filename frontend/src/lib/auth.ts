import { type DiscordProfile } from "next-auth/providers/discord";
import Discord from "next-auth/providers/discord";
import { type SessionStrategy } from "next-auth";

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  discordId?: string | null;
}

export interface Session {
  user: User;
  expires: string;
  accessToken?: string;
}

export const authConfig = {
  providers: [
    Discord({
      clientId: "809202086083428394",
      clientSecret: import.meta.env.VITE_DISCORD_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "identify email",
        },
      },
      profile(profile: DiscordProfile) {
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null,
          discordId: profile.id,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt" as SessionStrategy,
  },
};

export type AuthConfig = typeof authConfig;