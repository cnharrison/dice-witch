import React, { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';

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
      console.log('Discord ID:', discordAccount.providerUserId);
      const response = await fetch(`/api/guilds/mutual`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.guilds;
    },
    enabled: !!discordAccount?.providerUserId,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
};