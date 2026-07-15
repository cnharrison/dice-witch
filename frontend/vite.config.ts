import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

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

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(projectDirectory, "src"),
      },
    },
  };
});
