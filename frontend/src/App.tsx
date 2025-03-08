import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { UserProfile, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';
import { AuthWrapper } from './components/AuthWrapper';
import { Navbar } from './components/Navbar';
import { SvgFilters } from './components/SvgFilters';
import { Toaster } from './components/ui/toaster';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Preferences from './pages/Preferences';
import { GuildProvider } from './context/GuildContext';

const SSOCallback = () => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/app";
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff00ff]"></div>
        <p className="mt-4 text-white">Authenticating...</p>
      </div>
    </div>
  );
};

function App() {
  return (
    <>
      <SvgFilters />
      <Toaster />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/sign-in/*" element={<Navigate to="/" replace />} />
        
        <Route path="/sso-callback" element={<SSOCallback />} />

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

        <Route path="/app/profile" element={
          <AuthWrapper>
            <div className="min-h-screen bg-background text-foreground">
              <Navbar />
              <main className="container mx-auto py-6">
                <UserProfile />
              </main>
            </div>
          </AuthWrapper>
        } />

        <Route path="/preferences" element={<Navigate to="/app/preferences" replace />} />
        <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
      </Routes>
    </>
  );
}

export default App;
