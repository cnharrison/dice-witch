FROM oven/bun:1 AS base
WORKDIR /app/backend

# Install fonts for dice rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lists/*

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile

# Apply discord.js patch for Bun/WS error handling
COPY patches/apply-patch.js ./patches/
RUN node patches/apply-patch.js

# Generate Prisma client
RUN bunx prisma generate

# Production image
FROM base AS runner
WORKDIR /app/backend

COPY --from=deps /app/backend/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY . .

# Run as bun user (built into the image)
USER bun

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
