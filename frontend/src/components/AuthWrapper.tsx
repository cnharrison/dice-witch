import React, { type ReactNode, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '../lib/AuthProvider';
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
  const { isLoading, isSignedIn, user } = useAuth();
  const [authAttempts, setAuthAttempts] = useState(0);
  const [authTimer, setAuthTimer] = useState<number | null>(null);
  
  useEffect(() => {
  }, [isLoading, isSignedIn, user]);

  useEffect(() => {
    if (!isLoading && !isSignedIn && authAttempts < 3) {
      const timer = window.setTimeout(() => {
        setAuthAttempts(prev => prev + 1);
      }, 1000);
      setAuthTimer(timer);
      
      return () => {
        if (authTimer) window.clearTimeout(authTimer);
      };
    }
  }, [isLoading, isSignedIn, authAttempts]);

  useQuery({
    queryKey: ['mutualGuilds', user?.discordId],
    queryFn: async (): Promise<Guild[]> => {
      if (!user?.discordId) return [];
      const response = await customFetch(`/api/guilds/mutual`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.guilds;
    },
    enabled: !!user?.discordId,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 1000 * 60 * 15, // 15 minutes
    cacheTime: 1000 * 60 * 60, // 60 minutes
  });

  if (isLoading || (!isLoading && !isSignedIn && authAttempts < 3)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff00ff]"></div>
          <p className="mt-4 text-white">Summoning a nat 20...</p>
          {authAttempts > 0 && (
            <p className="mt-2 text-sm text-gray-400">Attempt {authAttempts}/3...</p>
          )}
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};