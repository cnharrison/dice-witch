import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { LoaderIcon } from "lucide-react";
import { GuildDropdown } from '@/components/GuildDropdown';
import { Guild } from "@/types/guild";

export const Home = () => {
  const { user } = useUser();
  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );

  const { data: mutualGuilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['mutualGuilds', discordAccount?.providerUserId],
    enabled: !!discordAccount?.providerUserId,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderIcon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAdminPermissions = mutualGuilds?.some(
    guild => guild.isAdmin || guild.isDiceWitchAdmin
  );

  if (!hasAdminPermissions) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <h1 className="text-2xl font-semibold text-center text-muted-foreground max-w-lg">
          It doesn't look like you have permission to roll in any of the guilds you're in
        </h1>
      </div>
    );
  }

  return (
    <div className="flex justify-center mt-8">
      <GuildDropdown guilds={mutualGuilds} />
    </div>
  );
};

export default Home;