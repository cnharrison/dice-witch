import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { SvgFilters } from './components/SvgFilters';
import LandingPage from './pages/LandingPage';
import { appConfig } from './lib/config';

const AuthenticatedApp = React.lazy(() => import('./components/AuthenticatedApp'));

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
                  <div className="grid h-full place-items-center bg-background text-foreground" role="status">
                    Loading Dice Witch…
                  </div>
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
