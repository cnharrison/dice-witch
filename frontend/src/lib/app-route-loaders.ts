export const loadAuthenticatedApp = () =>
  import("@/components/AuthenticatedApp");

export const loadDocsApp = () => import("@/pages/Docs/DocsApp");

export const loadHomePage = () => import("@/pages/Home");

export const loadLibraryPage = () => import("@/pages/SavedRolls");

export const loadPreferencesPage = () => import("@/pages/Preferences");
