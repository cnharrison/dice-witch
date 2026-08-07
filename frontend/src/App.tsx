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

const AuthenticatedApp = React.lazy(loadAuthenticatedApp);
const DocsApp = React.lazy(loadDocsApp);

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

function RouteLoading({ label }: { label: string }) {
  return (
    <SparkleLoadingIndicator
      label={label}
      className="h-full bg-background text-foreground"
    />
  );
}

function App() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EnvironmentBanner
        environment={appConfig.environment}
        buildSha={appConfig.buildSha}
      />
      <SvgFilters />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<LandingPage />} />
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
      </div>
    </div>
  );
}

export default App;
