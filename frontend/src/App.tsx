import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { SparkleLoadingIndicator } from './components/SparkleLoadingIndicator';
import { SvgFilters } from './components/SvgFilters';
import LandingPage from './pages/LandingPage';
import { appConfig } from './lib/config';
import {
  loadAuthenticatedApp,
  loadDocsApp,
  loadHomePage,
  loadLibraryPage,
  loadPreferencesPage,
} from './lib/app-route-loaders';

type PageModule = Promise<{ default: React.ComponentType }>;

interface AppRouteDependencies {
  LandingPage: React.ComponentType;
  loadAuthenticatedApp: () => PageModule;
  loadDocsApp: () => PageModule;
}

interface AppViewProps {
  AppRoutes: React.ComponentType;
  EnvironmentBannerSlot: React.ComponentType<{
    environment: typeof appConfig.environment;
    buildSha: string;
  }>;
  SvgFiltersSlot: React.ComponentType;
}

function RouteLoading({ label }: { label: string }) {
  return (
    <SparkleLoadingIndicator
      label={label}
      className="h-full bg-background text-foreground"
    />
  );
}

export function createAppRoutes({
  LandingPage: LandingPageComponent,
  loadAuthenticatedApp: loadAuthenticatedAppComponent,
  loadDocsApp: loadDocsAppComponent,
}: AppRouteDependencies): React.ComponentType {
  const AuthenticatedApp = React.lazy(loadAuthenticatedAppComponent);
  const DocsApp = React.lazy(loadDocsAppComponent);

  return function AppRoutes() {
    return (
      <Routes>
        <Route path="/" element={<LandingPageComponent />} />
        <Route path="/sign-in/*" element={<Navigate to="/" replace />} />
        <Route
          path="/docs/*"
          element={
            <React.Suspense fallback={<RouteLoading label="Loading Docs" />}>
              <DocsApp />
            </React.Suspense>
          }
        />
        <Route
          path="/app/*"
          element={
            <React.Suspense
              fallback={<RouteLoading label="Loading Dice Witch" />}
            >
              <AuthenticatedApp />
            </React.Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    );
  };
}

export function AppView({
  AppRoutes,
  EnvironmentBannerSlot,
  SvgFiltersSlot,
}: AppViewProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EnvironmentBannerSlot
        environment={appConfig.environment}
        buildSha={appConfig.buildSha}
      />
      <SvgFiltersSlot />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AppRoutes />
      </div>
    </div>
  );
}

const AppRoutes = createAppRoutes({
  LandingPage,
  loadAuthenticatedApp,
  loadDocsApp,
});

const initialPath = window.location.pathname.replace(/\/+$/, '') || '/';
if (initialPath === '/docs' || initialPath.startsWith('/docs/')) {
  void loadDocsApp();
} else if (initialPath === '/app' || initialPath.startsWith('/app/')) {
  void loadAuthenticatedApp();
  if (initialPath === '/app/preferences') {
    void loadPreferencesPage();
  } else if (initialPath === '/app/library') {
    void loadLibraryPage();
  } else {
    void loadHomePage();
  }
}

function App() {
  return (
    <AppView
      AppRoutes={AppRoutes}
      EnvironmentBannerSlot={EnvironmentBanner}
      SvgFiltersSlot={SvgFilters}
    />
  );
}

export default App;
