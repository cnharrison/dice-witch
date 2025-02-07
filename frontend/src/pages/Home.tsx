import { DiceInput } from '@/components/DiceInput';
import { GuildDropdown } from '@/components/GuildDropdown';
import { Roller } from '@/components/Roller';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import { Guild } from "@/types/guild";
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { LoaderIcon } from "lucide-react";
import * as React from 'react';

export const Home = () => {
  const { user } = useUser();
  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );
  const [selectedGuild, setSelectedGuild] = React.useState<string | undefined>();
  const { input, setInput, isValid, diceInfo } = useDiceValidation('');

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
    <div className="flex flex-col items-center mt-8">
      <div className="w-[300px] mb-8">
        <GuildDropdown
          guilds={mutualGuilds}
          onValueChange={setSelectedGuild}
        />
      </div>
      {selectedGuild && (
        <div className="w-full max-w-6xl px-4">
          <Roller diceInfo={diceInfo} />
          <DiceInput
            input={input}
            setInput={setInput}
            isValid={isValid}
          />
        </div>
      )}
    </div>
  );
};

export default Home;