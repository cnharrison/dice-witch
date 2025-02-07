import * as React from 'react';
import { Routes, Route } from 'react-router-dom';
import { UserProfile } from '@clerk/clerk-react';
import { AuthWrapper } from './components/AuthWrapper';
import CustomSignIn from './pages/SignIn';
import { Navbar } from './components/Navbar';
import Home from './pages/Home';

function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<CustomSignIn />} />
      <Route path="/" element={
        <AuthWrapper>
          <div className="min-h-screen">
            <Navbar />
            <main className="container mx-auto py-6">
              <Home />
            </main>
          </div>
        </AuthWrapper>
      } />
      <Route path="/profile" element={
        <AuthWrapper>
          <div className="min-h-screen">
            <Navbar />
            <main className="container mx-auto py-6">
              <UserProfile />
            </main>
          </div>
        </AuthWrapper>
      } />
    </Routes>
  );
}

export default App;
