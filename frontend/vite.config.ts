import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import remarkGfm from "remark-gfm";
import { defineConfig, loadEnv } from "vite";
import { docsSearchPlugin } from "./docs-search-plugin";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

function requireBuildValue(name: string, value: string | undefined): void {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, "");
  requireBuildValue("VITE_API_BASE", env.VITE_API_BASE);
  requireBuildValue("VITE_DISCORD_CLIENT_ID", env.VITE_DISCORD_CLIENT_ID);
  requireBuildValue("VITE_ENVIRONMENT", env.VITE_ENVIRONMENT);
  requireBuildValue("VITE_BUILD_SHA", env.VITE_BUILD_SHA);

  return {
    plugins: [
      docsSearchPlugin(path.join(projectDirectory, "src/pages/Docs/content")),
      mdx({ remarkPlugins: [remarkGfm] }),
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(projectDirectory, "src"),
      },
    },
  };
});
