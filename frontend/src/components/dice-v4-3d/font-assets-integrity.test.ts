import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const UI_FONT_HASHES = {
  "BarlowCondensed-SemiBold-ui.ttf":
    "31700098f3b7c04a6aca2f6d3ec27261b3b8e1781e8357abe3727c72400c6a33",
  "BricolageGrotesque-SemiBold-ui.ttf":
    "8d658c60c8ef2d6e3b8916fe46dece285eeef9736417aaacc26b28abe8a60257",
  "Cinzel-SemiBold-ui.ttf":
    "110c6b882618c7b8ae2b5af07acb59a6fdcdc3c1e22020d240413d218a121451",
  "Fraunces-SemiBold-ui.ttf":
    "dad81f96bb8fbdb414e508ce01a787ac38562bd62dcded0a0e9f2512e76da096",
  "JetBrainsMono-SemiBold-ui.ttf":
    "2d629dfcd2e30d8cf9e0aaa37eaa02c8a2ea726118178fe073bef06de4a3eeb2",
  "SourceSans3-SemiBold-ui.ttf":
    "8942cae93f46091706aec8d4f738007e6fec1ae81ae5cfb79bc964907e98098c",
  "SpaceGrotesk-SemiBold-ui.ttf":
    "409e10b1041de8da4cf8af3c44f96ac4b8f065234b40a7bed1ecc864b29ec4a1",
  "ZillaSlab-SemiBold-ui.ttf":
    "492986261113b907ddfa01fa79598931121e36148984d6244066bbedb6a7c86f",
} as const;

describe("r32 UI font assets", () => {
  it("pins every deterministic subset hash", async () => {
    const hashes = Object.fromEntries(
      await Promise.all(
        Object.keys(UI_FONT_HASHES).map(async (filename) => {
          const bytes = await readFile(
            new URL(`../../assets/fonts/appearance/${filename}`, import.meta.url),
          );
          return [filename, createHash("sha256").update(bytes).digest("hex")];
        }),
      ),
    );

    expect(hashes).toEqual(UI_FONT_HASHES);
  });
});
