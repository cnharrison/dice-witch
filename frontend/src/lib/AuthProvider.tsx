import React, { createContext, useContext, useEffect, useState } from 'react';
import { appConfig } from './config';
import type { Session, User } from '../types/auth';

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  isSignedIn: boolean;
  user: User | null;
  signIn: (provider: string, returnTo?: string) => void;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${appConfig.apiBase}/api/auth/session`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setSession(data);
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const signIn = (provider: string, returnTo?: string) => {
    const url = new URL(`${appConfig.apiBase}/api/auth/signin/${provider}`);
    if (returnTo !== undefined) url.searchParams.set('returnTo', returnTo);
    window.location.href = url.toString();
  };

  const signOut = async () => {
    try {
      await fetch(`${appConfig.apiBase}/api/auth/signout`, {
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
      authenticateWithRedirect: ({
        strategy,
        returnTo,
      }: {
        strategy: string;
        returnTo?: string;
      }) => signIn(strategy.replace('oauth_', ''), returnTo),
    },
    isLoaded: !isLoading,
  };
}