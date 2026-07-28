/// <reference types="vite/client" />

declare module "virtual:dice-witch-docs-search" {
  const docsSearchText: Readonly<Record<string, string>>;
  export default docsSearchText;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_DISCORD_CLIENT_ID: string;
  readonly VITE_ENVIRONMENT: string;
  readonly VITE_BUILD_SHA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
