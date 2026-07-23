import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "eslint.config.js",
      ".generated/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "packages/dice-canvaskit/assets/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./tsconfig.roll.json",
          "./tsconfig.canvaskit-runtime.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["packages/dice-svg/src/dice/**/*.ts"],
    rules: {
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["*.config.js", "tools/**/*.mjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
);
