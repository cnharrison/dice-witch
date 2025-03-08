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
  const [countdown, setCountdown] = React.useState(15);
  
  React.useEffect(() => {
    console.log('[Auth] SSOCallback component mounted');
    
    try {
      const url = window.location.href;
      const hasAuthCode = url.includes("code=");
      const hasClerkToken = url.includes("__clerk_token=");
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      
      console.log('[Auth] Current URL:', url);
      console.log('[Auth] URL contains auth code:', hasAuthCode);
      console.log('[Auth] URL contains clerk token:', hasClerkToken);
      console.log('[Auth] Search params:', Object.fromEntries(searchParams.entries()));
      console.log('[Auth] Hash params:', Object.fromEntries(hashParams.entries()));
      console.log('[Auth] Document referrer:', document.referrer);
      console.log('[Auth] Document cookie exists:', !!document.cookie);
      console.log('[Auth] Cookie length:', document.cookie.length);
      
      const cookies = document.cookie.split(';').map(c => c.trim());
      console.log('[Auth] Cookie count:', cookies.length);
      console.log('[Auth] Cookie names:', cookies.map(c => c.split('=')[0]));
      
      console.log('[Auth] LocalStorage available:', typeof localStorage !== 'undefined');
      
      if (localStorage) {
        try {
          const testKey = "__clerk_test_storage__";
          localStorage.setItem(testKey, "test");
          const testValue = localStorage.getItem(testKey);
          localStorage.removeItem(testKey);
          console.log('[Auth] LocalStorage works:', testValue === "test");
          
          const clerkKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('clerk')) {
              clerkKeys.push(key);
            }
          }
          console.log('[Auth] Clerk localStorage keys:', clerkKeys);
        } catch (e) {
          console.error('[Auth] LocalStorage error:', e);
        }
      }
      
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            console.log('[Auth] Forcing redirection to /app');
            window.location.href = "/app";
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        console.log('[Auth] SSOCallback unmounting, clearing interval');
        clearInterval(countdownInterval);
      };
    } catch (error) {
      console.error('[Auth] Error in SSOCallback:', error);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff00ff]"></div>
        <p className="mt-4 text-white">Authenticating...</p>
        <p className="mt-2 text-zinc-400">Redirecting to app in {countdown}s...</p>
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
