import React, { type ReactNode, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '../main';

type Guild = {
  id: string;
  name: string | null;
  icon: string | null;
  isActive: boolean | null;
};

type AuthWrapperProps = {
  children: ReactNode;
};

export const AuthWrapper = ({ children }: AuthWrapperProps) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [authAttempts, setAuthAttempts] = useState(0);
  const [authTimer, setAuthTimer] = useState<number | null>(null);
  
  useEffect(() => {
    console.log('[Auth Diagnostics] Status:', { 
      isLoaded, 
      isSignedIn, 
      userExists: !!user,
      userDetails: user ? {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        hasDiscordAccount: user.externalAccounts.some(a => a.provider === 'discord')
      } : null
    });
    
    if (isLoaded) {
      console.log('[Auth Diagnostics] URL:', window.location.href);
      console.log('[Auth Diagnostics] Has last_active_path param:', window.location.href.includes('last_active_path'));
      console.log('[Auth Diagnostics] Document cookie exists:', !!document.cookie);
      console.log('[Auth Diagnostics] Cookie length:', document.cookie.length);
      
      const cookies = document.cookie.split(';').map(c => c.trim());
      console.log('[Auth Diagnostics] Cookie count:', cookies.length);
      console.log('[Auth Diagnostics] Cookie names:', cookies.map(c => c.split('=')[0]));
      
      console.log('[Auth Diagnostics] LocalStorage available:', typeof localStorage !== 'undefined');
      
      if (typeof localStorage !== 'undefined') {
        try {
          const clerkKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('clerk')) {
              clerkKeys.push(key);
            }
          }
          console.log('[Auth Diagnostics] Clerk localStorage keys:', clerkKeys);
        } catch (e) {
          console.error('[Auth Diagnostics] LocalStorage error:', e);
        }
      }
      
      if (isSignedIn) {
        getToken().then(token => {
          console.log('[Auth Diagnostics] Token available:', !!token);
          if (token) {
            console.log('[Auth Diagnostics] Token length:', token.length);
          }
        }).catch(err => {
          console.error('[Auth Diagnostics] Error getting token:', err);
        });
      } else {
        console.log('[Auth Diagnostics] Not signed in, checking current URL for parameters');
        const searchParams = new URLSearchParams(window.location.search);
        console.log('[Auth Diagnostics] URL params:', Object.fromEntries(searchParams.entries()));
      }
    }
  }, [isLoaded, isSignedIn, user, getToken]);

  useEffect(() => {
    if (isLoaded && !isSignedIn && authAttempts < 3) {
      const timer = window.setTimeout(() => {
        setAuthAttempts(prev => prev + 1);
      }, 1000);
      setAuthTimer(timer);
      
      return () => {
        if (authTimer) window.clearTimeout(authTimer);
      };
    }
  }, [isLoaded, isSignedIn, authAttempts]);

  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );

  useQuery({
    queryKey: ['mutualGuilds', discordAccount?.providerUserId],
    queryFn: async (): Promise<Guild[]> => {
      if (!discordAccount?.providerUserId) return [];
      const response = await customFetch(`/api/guilds/mutual`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.guilds;
    },
    enabled: !!discordAccount?.providerUserId,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 1000 * 60 * 15, // 15 minutes
    cacheTime: 1000 * 60 * 60, // 60 minutes
  });

  if (!isLoaded || (isLoaded && !isSignedIn && authAttempts < 3)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff00ff]"></div>
          <p className="mt-4 text-white">Loading your profile...</p>
          {authAttempts > 0 && (
            <p className="mt-2 text-sm text-gray-400">Attempt {authAttempts}/3...</p>
          )}
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    console.log('[AuthWrapper] User not signed in after multiple attempts, redirecting to sign-in');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};