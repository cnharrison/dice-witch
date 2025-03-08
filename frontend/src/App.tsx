import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthWrapper } from './components/AuthWrapper';
import { Navbar } from './components/Navbar';
import { SvgFilters } from './components/SvgFilters';
import { Toaster } from './components/ui/toaster';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Preferences from './pages/Preferences';
import { GuildProvider } from './context/GuildContext';


function App() {
  return (
    <>
      <SvgFilters />
      <Toaster />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/sign-in/*" element={<Navigate to="/" replace />} />

        <Route path="/app" element={
          <AuthWrapper>
            <GuildProvider>
              <div className="min-h-screen bg-background text-foreground">
                <Navbar />
                <main className="container mx-auto py-6">
                  <Home />
                </main>
              </div>
            </GuildProvider>
          </AuthWrapper>
        } />

        <Route path="/app/preferences" element={
          <AuthWrapper>
            <GuildProvider>
              <div className="min-h-screen bg-background text-foreground">
                <Navbar />
                <main className="container mx-auto py-6">
                  <Preferences />
                </main>
              </div>
            </GuildProvider>
          </AuthWrapper>
        } />

        <Route path="/preferences" element={<Navigate to="/app/preferences" replace />} />
      </Routes>
    </>
  );
}

export default App;
