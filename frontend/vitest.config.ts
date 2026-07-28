import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vitest/config";
import { docsSearchPlugin } from "./docs-search-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    docsSearchPlugin(path.join(root, "src/pages/Docs/content")),
    mdx({ remarkPlugins: [remarkGfm] }),
  ],
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
