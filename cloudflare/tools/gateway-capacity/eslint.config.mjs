import base from "../../eslint.config.js";

export default [
  ...base,
  {
    files: ["tools/gateway-capacity/staging-*.ts"],
    languageOptions: { parserOptions: { project: "./tools/gateway-capacity/tsconfig.staging.json" } },
  },
  {
    files: ["tools/gateway-capacity/staging-fixture.mjs"],
    languageOptions: { globals: { WebSocketPair: "readonly" } },
  },
];
