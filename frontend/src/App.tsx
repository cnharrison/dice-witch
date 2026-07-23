import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthWrapper } from './components/AuthWrapper';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { Navbar } from './components/Navbar';
import { SvgFilters } from './components/SvgFilters';
import { Toaster } from './components/ui/toaster';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Preferences from './pages/Preferences';
import { GuildProvider } from './context/GuildContext';
import { appConfig } from './lib/config';

function App() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EnvironmentBanner
        environment={appConfig.environment}
        buildSha={appConfig.buildSha}
      />
      <SvgFilters />
      <Toaster />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in/*" element={<Navigate to="/" replace />} />
          <Route
            path="/app/*"
            element={
              <AuthWrapper>
                <GuildProvider>
                  <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
                    <Navbar />
                    <main className="container mx-auto min-h-0 flex-1 overflow-y-auto">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/preferences" element={<Preferences />} />
                      </Routes>
                    </main>
                  </div>
                </GuildProvider>
              </AuthWrapper>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
