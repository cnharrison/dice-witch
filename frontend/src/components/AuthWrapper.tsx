import React, { type ReactNode } from 'react';
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
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

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

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff00ff]"></div>
          <p className="mt-4 text-white">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    console.log('[AuthWrapper] User not signed in, redirecting to sign-in');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};