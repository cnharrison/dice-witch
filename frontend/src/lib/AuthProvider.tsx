import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from './auth';

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  isSignedIn: boolean;
  user: User | null;
  signIn: (provider: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  isSignedIn: false,
  user: null,
  signIn: () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.dicewit.ch';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/session`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setSession(data);
        } else {
          setSession(null);
        }
      } catch (error) {
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const signIn = (provider: string) => {
    // Redirect to auth endpoint
    window.location.href = `${API_BASE}/api/auth/signin/${provider}`;
  };

  const signOut = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
      setSession(null);
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    session,
    isLoading,
    isSignedIn: !!session?.user,
    user: session?.user || null,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export function useUser() {
  const { user } = useAuth();
  return { user, isLoaded: !useAuth().isLoading };
}

export function useSignIn() {
  const { signIn, isLoading } = useAuth();
  return { 
    signIn: { 
      authenticateWithRedirect: ({strategy}: any) => signIn(strategy.replace('oauth_', ''))
    }, 
    isLoaded: !isLoading 
  };
}