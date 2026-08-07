import * as React from 'react';
import { Route, Routes } from 'react-router';
import { AuthWrapper } from './AuthWrapper';
import { Navbar } from './Navbar';
import { Toaster } from './ui/toaster';
import { GuildProvider } from '@/context/GuildContext';
import { SparkleLoadingIndicator } from './SparkleLoadingIndicator';
import {
  loadHomePage,
  loadLibraryPage,
  loadPreferencesPage,
} from '@/lib/app-route-loaders';

const Home = React.lazy(loadHomePage);
const Preferences = React.lazy(loadPreferencesPage);
const SavedRolls = React.lazy(loadLibraryPage);

export default function AuthenticatedApp() {
  return (
    <AuthWrapper>
      <Toaster />
      <GuildProvider>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <Navbar />
          <main className="min-h-0 w-full flex-1 overflow-y-auto">
            <React.Suspense
              fallback={
                <SparkleLoadingIndicator
                  label="Loading workspace"
                  className="min-h-64"
                />
              }
            >
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/preferences" element={<Preferences />} />
                <Route path="/library" element={<SavedRolls />} />
              </Routes>
            </React.Suspense>
          </main>
        </div>
      </GuildProvider>
    </AuthWrapper>
  );
}
