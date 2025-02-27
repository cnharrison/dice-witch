import * as React from 'react';
import { Routes, Route } from 'react-router-dom';
import { UserProfile } from '@clerk/clerk-react';
import { AuthWrapper } from './components/AuthWrapper';
import CustomSignIn from './pages/SignIn';
import { Navbar } from './components/Navbar';
import { SvgFilters } from './components/SvgFilters';
import Home from './pages/Home';
import Preferences from './pages/Preferences';
import { GuildProvider } from './context/GuildContext';

function App() {
  return (
    <>
      <SvgFilters />
      <Routes>
        <Route path="/sign-in/*" element={<CustomSignIn />} />
        <Route path="/" element={
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
        <Route path="/preferences" element={
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
        <Route path="/profile" element={
          <AuthWrapper>
            <div className="min-h-screen bg-background text-foreground">
              <Navbar />
              <main className="container mx-auto py-6">
                <UserProfile />
              </main>
            </div>
          </AuthWrapper>
        } />
      </Routes>
    </>
  );
}

export default App;
