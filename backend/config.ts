export const CONFIG = {
  database: {
    url: process.env.DATABASE_URL,
  },
  dice: {
    canvasPoolSize: Number.parseInt(process.env.DICE_CANVAS_POOL_SIZE || "3", 10),
  },
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    clientId: process.env.DISCORD_CLIENT_ID,
    logOutputChannelId: process.env.LOG_OUTPUT_CHANNEL_ID!,
    renderErrorChannelId: process.env.LOG_RENDER_ERROR_CHANNEL_ID || process.env.LOG_OUTPUT_CHANNEL_ID!,
    adminId: process.env.ADMIN_ID,
    supportServerLink: process.env.SUPPORT_SERVER_LINK!,
    inviteLink: process.env.INVITE_LINK!,
  },
  botListAuth: {
    discordbotlist: process.env.DISCORD_BOT_LIST_KEY!,
    topgg: process.env.TOPGG_KEY!,
    dbots: process.env.DBOTS_KEY!,
  },
  botPath: process.env.BOT_PATH!,
} as const;
