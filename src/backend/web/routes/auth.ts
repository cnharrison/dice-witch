import { Hono } from "hono";
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';

export const auth = new Hono();

auth.use('*', clerkMiddleware());

auth.get("/user", async (c) => {
  try {
    const auth = getAuth(c);
    const clerk = c.get('clerk');

    if (!auth?.userId) {
      return c.json({
        message: 'You are not logged in.',
      }, 401);
    }

    const user = await clerk.users.getUser(auth.userId);
    const discordAccount = user.externalAccounts.find(
      account => account.provider === "discord"
    );

    return c.json({
      message: "Authentication successful",
      user: {
        id: discordAccount?.externalId || user.id,
        username: discordAccount?.username || user.username,
        avatar: discordAccount?.imageUrl || user.imageUrl,
      }
    });
  } catch (error) {
    console.error("Auth error:", error);
    return c.json({ error: "Authentication failed" }, 500);
  }
});