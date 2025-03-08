/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_DISCORD_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
