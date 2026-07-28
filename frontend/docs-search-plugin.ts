import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const MODULE_ID = "virtual:dice-witch-docs-search";
const RESOLVED_MODULE_ID = `\0${MODULE_ID}`;

export function docsSearchPlugin(contentDirectory: string): Plugin {
  return {
    name: "dice-witch-docs-search",
    enforce: "pre",
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_MODULE_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_MODULE_ID) return undefined;

      const fileNames = (await readdir(contentDirectory))
        .filter((fileName) => fileName.endsWith(".md"))
        .sort();
      if (fileNames.length === 0) {
        throw new Error("Dice Witch documentation content is required");
      }

      const entries = await Promise.all(
        fileNames.map(async (fileName) => {
          const filePath = path.join(contentDirectory, fileName);
          this.addWatchFile(filePath);
          return [
            fileName.slice(0, -".md".length),
            await readFile(filePath, "utf8"),
          ] as const;
        }),
      );

      return `export default ${JSON.stringify(Object.fromEntries(entries))};`;
    },
  };
}
