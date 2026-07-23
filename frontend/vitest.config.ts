import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify("https://api.example.com"),
    "import.meta.env.VITE_DISCORD_CLIENT_ID": JSON.stringify(
      "100000000000000001",
    ),
    "import.meta.env.VITE_ENVIRONMENT": JSON.stringify("staging"),
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify(
      "abcdef0123456789abcdef0123456789abcdef01",
    ),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
