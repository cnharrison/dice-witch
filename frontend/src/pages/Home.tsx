import { DiceInput } from '@/components/DiceInput';
import { GuildDropdown } from '@/components/GuildDropdown';
import { ChannelDropdown } from '@/components/ChannelDropdown';
import { Roller } from '@/components/Roller';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import { Guild } from "@/types/guild";
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { LoaderIcon } from "lucide-react";
import * as React from 'react';
import { Button } from '@/components/ui/button';

export const Home = () => {
  const { user } = useUser();
  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );
  const [selectedGuild, setSelectedGuild] = React.useState<string | undefined>();
  const [selectedChannel, setSelectedChannel] = React.useState<string | undefined>();
  const { input, setInput, isValid, diceInfo } = useDiceValidation('');
  const [isRolling, setIsRolling] = React.useState(false);

  const { data: mutualGuilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['mutualGuilds', discordAccount?.providerUserId],
    enabled: !!discordAccount?.providerUserId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: channelsResponse } = useQuery({
    queryKey: ['channels', selectedGuild],
    queryFn: async () => {
      const response = await fetch(`/api/guilds/${selectedGuild}/channels`);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedGuild,
  });

  const channels = channelsResponse?.channels || [];
  
  const uniqueChannelTypes = [...new Set(channels.map(c => c.type))];

  const handleRollDice = async () => {
    if (!isValid || !selectedChannel || !input) return;

    const selectedChannelObj = channels.find(c => c.id === selectedChannel);

    try {
      setIsRolling(true);
      const response = await fetch('/api/dice/roll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: selectedChannel,
          notation: input,
        }),
      });

      await response.json();
      
    } catch (error) {
    } finally {
      setIsRolling(false);
    }
  };

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
      <div className="w-[300px] mb-4">
        <GuildDropdown
          guilds={mutualGuilds}
          onValueChange={(value) => {
            setSelectedGuild(value);
            setSelectedChannel(undefined);
          }}
        />
      </div>
      {selectedGuild && Array.isArray(channels) && channels.length > 0 && (
        <div className="w-[300px] mb-8">
          <ChannelDropdown
            channels={channels}
            onValueChange={setSelectedChannel}
          />
        </div>
      )}
      {selectedGuild && (
        <div className="w-full max-w-6xl px-4">
          <Roller diceInfo={diceInfo} />
          <DiceInput
            input={input}
            setInput={setInput}
            isValid={isValid}
          />
          <div className="mt-4 flex justify-center">
            <Button
              onClick={handleRollDice}
              disabled={!isValid || !selectedChannel || isRolling}
              className="w-1/3"
            >
              {isRolling ? 'Rolling...' : 'Roll Dice'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;