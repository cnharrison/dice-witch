import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { SparkleLoadingIndicator } from './components/SparkleLoadingIndicator';
import { SvgFilters } from './components/SvgFilters';
import LandingPage from './pages/LandingPage';
import { appConfig } from './lib/config';
import {
  loadAuthenticatedApp,
  loadHomePage,
  loadLibraryPage,
  loadPreferencesPage,
} from './lib/app-route-loaders';

const AuthenticatedApp = React.lazy(loadAuthenticatedApp);

const initialPath = window.location.pathname.replace(/\/+$/, '') || '/';
if (initialPath === '/app' || initialPath.startsWith('/app/')) {
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
            path="/app/*"
            element={
              <React.Suspense
                fallback={
                  <SparkleLoadingIndicator
                    label="Loading Dice Witch"
                    className="h-full bg-background text-foreground"
                  />
                }
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
