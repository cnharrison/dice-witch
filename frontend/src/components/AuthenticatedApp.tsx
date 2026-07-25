import { Route, Routes } from 'react-router-dom';
import { AuthWrapper } from './AuthWrapper';
import { Navbar } from './Navbar';
import { Toaster } from './ui/toaster';
import { GuildProvider } from '@/context/GuildContext';
import Home from '@/pages/Home';
import Preferences from '@/pages/Preferences';

export default function AuthenticatedApp() {
  return (
    <AuthWrapper>
      <Toaster />
      <GuildProvider>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <Navbar />
          <main className="min-h-0 w-full flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/preferences" element={<Preferences />} />
            </Routes>
          </main>
        </div>
      </GuildProvider>
    </AuthWrapper>
  );
}
