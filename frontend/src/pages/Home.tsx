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
import { Input as InputComponent } from '@/components/ui/input';
import { Button as ButtonComponent } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGuild } from '@/context/GuildContext';
import { useToast } from '@/hooks/use-toast';

export const Home = () => {
  const { user } = useUser();
  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );
  const { 
    selectedGuildId: selectedGuild, 
    selectedChannelId: selectedChannel, 
    setSelectedGuildId: setSelectedGuild,
    setSelectedChannelId: setSelectedChannel 
  } = useGuild();
  const { input, setInput, isValid, diceInfo } = useDiceValidation('');
  const [isRolling, setIsRolling] = React.useState(false);
  const [rollResults, setRollResults] = React.useState<RollResponse | null>(null);
  const [showAnimation, setShowAnimation] = React.useState(false);
  const [timesToRepeat, setTimesToRepeat] = React.useState<number>(1);
  const [rollTitle, setRollTitle] = React.useState<string>('');

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
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const channels = channelsResponse?.channels || [];

  const { toast } = useToast();
  
  const handleRollDice = async () => {
    if (!isValid || !selectedChannel || !input) return;

    const selectedChannelObj = channels.find(c => c.id === selectedChannel);

    try {
      setIsRolling(true);
      setShowAnimation(true);
      setRollResults(null);

      const requestBody = {
        channelId: selectedChannel,
        notation: input,
        source: 'web',
        username: user?.username || discordAccount?.username,
        timesToRepeat: timesToRepeat,
        title: rollTitle || undefined
      };
      const response = await fetch('/api/dice/roll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      if (data.error === 'PERMISSION_ERROR') {
        toast({
          title: "Missing Discord Permissions",
          description: "I need permission to read message history, attach files, and embed links to show you the dice 😊",
          variant: "destructive",
        });
      }
      
      setRollResults(data);
      setIsRolling(false);

    } catch (error) {
      console.error('Error rolling dice:', error);
      setIsRolling(false);
      
      toast({
        title: "Error Rolling Dice",
        description: "Something went wrong when trying to roll. Please try again.",
        variant: "destructive",
      });
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
    <TooltipProvider>
      <div className="flex flex-col items-center mt-8">
        <div className="relative w-full max-w-md mb-8 overflow-visible hidden sm:block">
          <LoadingMedia
            staticImage="/images/dice-witch-banner.webp"
            loadingVideo="/videos/dice-witch-loading.mp4"
            className="w-full h-auto rounded-full"
            isLoading={isRolling}
            alt="Dice Witch"
            blendMode="normal"
            hideText
          />

        </div>

        <div className="w-[300px] mb-4">
          <GuildDropdown
            guilds={mutualGuilds}
            value={selectedGuild}
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
              value={selectedChannel}
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
              input={input}
              setInput={handleInputChange}
              selectedChannel={!!selectedChannel}
            />
            <DiceInput
              input={input}
              setInput={handleInputChange}
              isValid={isValid}
              onRoll={handleRollDice}
              timesToRepeat={timesToRepeat}
              onTimesToRepeatChange={setTimesToRepeat}
              selectedChannel={!!selectedChannel}
              rollTitle={rollTitle}
              onRollTitleChange={setRollTitle}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default Home;