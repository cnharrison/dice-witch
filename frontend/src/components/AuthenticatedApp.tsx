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

type PageModule = Promise<{ default: React.ComponentType }>;
type BoundarySlot = React.ComponentType<React.PropsWithChildren>;

interface AuthenticatedRouteDependencies {
  loadHomePage: () => PageModule;
  loadLibraryPage: () => PageModule;
  loadPreferencesPage: () => PageModule;
}

interface AuthenticatedAppViewProps {
  AuthenticatedRoutes: React.ComponentType;
  AuthBoundary: BoundarySlot;
  GuildBoundary: BoundarySlot;
  NavbarSlot: React.ComponentType;
  ToasterSlot: React.ComponentType;
}

export function createAuthenticatedAppRoutes({
  loadHomePage: loadHome,
  loadLibraryPage: loadLibrary,
  loadPreferencesPage: loadPreferences,
}: AuthenticatedRouteDependencies): React.ComponentType {
  const Home = React.lazy(loadHome);
  const Preferences = React.lazy(loadPreferences);
  const SavedRolls = React.lazy(loadLibrary);

  return function AuthenticatedRoutes() {
    return (
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
    );
  };
}

export function AuthenticatedAppView({
  AuthenticatedRoutes,
  AuthBoundary,
  GuildBoundary,
  NavbarSlot,
  ToasterSlot,
}: AuthenticatedAppViewProps) {
  return (
    <AuthBoundary>
      <ToasterSlot />
      <GuildBoundary>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <NavbarSlot />
          <main className="min-h-0 w-full flex-1 overflow-y-auto">
            <AuthenticatedRoutes />
          </main>
        </div>
      </GuildBoundary>
    </AuthBoundary>
  );
}

const AuthenticatedRoutes = createAuthenticatedAppRoutes({
  loadHomePage,
  loadLibraryPage,
  loadPreferencesPage,
});

export default function AuthenticatedApp() {
  return (
    <AuthenticatedAppView
      AuthenticatedRoutes={AuthenticatedRoutes}
      AuthBoundary={AuthWrapper}
      GuildBoundary={GuildProvider}
      NavbarSlot={Navbar}
      ToasterSlot={Toaster}
    />
  );
}
