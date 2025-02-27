import { DiceInput } from '@/components/DiceInput';
import { GuildDropdown } from '@/components/GuildDropdown';
import { ChannelDropdown } from '@/components/ChannelDropdown';
import { Roller } from '@/components/Roller';
import { LoadingMedia } from '@/components/LoadingMedia';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import { Guild } from "@/types/guild";
import { RollResponse } from '@/types/dice';
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
  const [rollResults, setRollResults] = React.useState<RollResponse | null>(null);
  const [showAnimation, setShowAnimation] = React.useState(false);

  React.useEffect(() => {
    if (!input) {
      setIsRolling(false);
      setRollResults(null);
      setShowAnimation(false);
    } else {
      setShowAnimation(isValid);
    }
  }, [input, isValid]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!value) {
      setIsRolling(false);
      setRollResults(null);
      setShowAnimation(false);
    }
  };

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

  const handleRollDice = async () => {
    if (!isValid || !selectedChannel || !input) return;

    const selectedChannelObj = channels.find(c => c.id === selectedChannel);

    try {
      setIsRolling(true);
      setShowAnimation(true);
      setRollResults(null);

      const response = await fetch('/api/dice/roll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: selectedChannel,
          notation: input,
          source: 'web',
          username: user?.username || discordAccount?.username
        }),
      });

      const data = await response.json();
      setRollResults(data);

    } catch (error) {
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
      <div className="relative w-full max-w-md mb-8 overflow-visible">
        <LoadingMedia
          staticImage="/images/dice-witch-banner.webp"
          loadingVideo="/videos/dice-witch-loading.mp4"
          className="w-full h-auto rounded-full"
          isLoading={isRolling}
          alt="Dice Witch"
          blendMode="normal"
          hideText
        />

        <div
          className="absolute inset-0 flex items-center justify-center z-[9999]"
        >
          <div className="font-['UnifrakturMaguntia'] text-[#ff00ff] text-[14rem] font-bold tracking-wide whitespace-nowrap [text-shadow:4px_4px_8px_rgba(0,0,0,0.95)]">
            Dice Witch
          </div>
        </div>
      </div>

      <div className="w-[300px] mb-4">
        <GuildDropdown
          guilds={mutualGuilds}
          onValueChange={(value) => {
            setSelectedGuild(value);
            setSelectedChannel(undefined);
            setRollResults(null);
          }}
        />
      </div>
      {selectedGuild && Array.isArray(channels) && channels.length > 0 && (
        <div className="w-[300px] mb-8">
          <ChannelDropdown
            channels={channels}
            onValueChange={(value) => {
              setSelectedChannel(value);
              setRollResults(null);
            }}
          />
        </div>
      )}
      {selectedGuild && (
        <div className="w-full max-w-6xl px-4">
          <Roller
            diceInfo={diceInfo}
            rollResults={rollResults}
            isRolling={isRolling}
            showAnimation={showAnimation || isRolling}
          />
          <DiceInput
            input={input}
            setInput={handleInputChange}
            isValid={isValid}
            onRoll={handleRollDice}
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