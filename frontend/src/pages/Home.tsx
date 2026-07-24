import { DiceInput } from '@/components/DiceInput';
import { GuildDropdown } from '@/components/GuildDropdown';
import { ChannelDropdown } from '@/components/ChannelDropdown';
import { Roller } from '@/components/Roller';
import { LoadingMedia } from '@/components/LoadingMedia';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import type { Guild } from "@/types/guild";
import type { RollPreparation, RollResponse } from '@/types/dice';
import { useUser } from '@/lib/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { LoaderIcon } from "lucide-react";
import * as React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGuild } from '@/context/GuildContext';
import { useToast } from '@/hooks/use-toast';
import { customFetch } from '../lib/api';
import { appConfig } from '@/lib/config';
import {
  parseWebRollPreparation,
  parseWebRollResponse,
} from '@/lib/roll-response';

type RollPreparationState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: RollPreparation };

export const Home = () => {
  const { user } = useUser();
  const {
    selectedGuildId: selectedGuild,
    selectedChannelId: selectedChannel,
    setSelectedGuildId: setSelectedGuild,
    setSelectedChannelId: setSelectedChannel
  } = useGuild();
  const { input, setInput, isValid, diceInfo, validatedInput } = useDiceValidation('');
  const [isRolling, setIsRolling] = React.useState(false);
  const [rollResults, setRollResults] = React.useState<RollResponse | null>(null);
  const [timesToRepeat, setTimesToRepeat] = React.useState<number>(1);
  const [rollTitle, setRollTitle] = React.useState<string>('');
  const [preparation, setPreparation] = React.useState<RollPreparationState>({
    status: "idle",
  });
  const [visiblePreparation, setVisiblePreparation] =
    React.useState<RollPreparation | null>(null);
  const [preparationRetry, setPreparationRetry] = React.useState(0);
  const stableRenderSeed = React.useRef<number | undefined>(undefined);
  const rollRequestRevision = React.useRef(0);
  const activeRollController = React.useRef<AbortController | null>(null);

  const cancelActiveRoll = React.useCallback(() => {
    rollRequestRevision.current += 1;
    activeRollController.current?.abort();
    activeRollController.current = null;
    setIsRolling(false);
  }, []);

  React.useEffect(
    () => () => {
      rollRequestRevision.current += 1;
      activeRollController.current?.abort();
    },
    [],
  );

  const { data: mutualGuilds, isLoading, isFetching } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await customFetch('/api/guilds/mutual');
      if (!response.ok) {
        throw new Error('Failed to fetch guilds');
      }
      const data = await response.json();
      return data.guilds || [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
  });

  const handleInputChange = (value: string) => {
    cancelActiveRoll();
    setInput(value);
    setPreparation({ status: "idle" });
    if (!value) {
      setIsRolling(false);
      setVisiblePreparation(null);
      stableRenderSeed.current = undefined;
    }
  };

  const { data: channelsResponse } = useQuery({
    queryKey: ['channels', selectedGuild],
    queryFn: async () => {
      const response = await customFetch(`/api/guilds/${selectedGuild}/channels`);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedGuild,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });


  const channels = channelsResponse?.channels || [];

  const { toast } = useToast();

  React.useEffect(() => {
    if (
      !selectedGuild ||
      !input ||
      validatedInput !== input ||
      !isValid ||
      diceInfo === null
    ) {
      setPreparation({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setPreparation({ status: "loading" });
    void customFetch('/api/dice/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId: selectedGuild,
        notation: input,
        timesToRepeat,
        ...(stableRenderSeed.current === undefined
          ? {}
          : { renderSeed: stableRenderSeed.current }),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const value: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof value === "object" &&
              value !== null &&
              "error" in value &&
              typeof value.error === "string"
              ? value.error
              : "Exact dice preparation failed",
          );
        }
        return parseWebRollPreparation(value);
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          stableRenderSeed.current = value.renderSeed;
          setRollResults(null);
          setVisiblePreparation(value);
          setPreparation({ status: "ready", value });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPreparation({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Exact dice preparation failed",
        });
      });
    return () => controller.abort();
  }, [
    diceInfo,
    input,
    isValid,
    preparationRetry,
    selectedGuild,
    timesToRepeat,
    validatedInput,
  ]);

  const handleRollDice = async () => {
    if (
      !isValid ||
      !selectedGuild ||
      !selectedChannel ||
      !input ||
      preparation.status !== "ready"
    ) {
      return;
    }

    activeRollController.current?.abort();
    const controller = new AbortController();
    activeRollController.current = controller;
    const revision = ++rollRequestRevision.current;
    const isCurrent = () =>
      !controller.signal.aborted && revision === rollRequestRevision.current;

    try {
      setIsRolling(true);

      const response = await customFetch("/api/dice/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuild,
          channelId: selectedChannel,
          notation: input,
          renderSeed: preparation.value.renderSeed,
          appearanceDigest: preparation.value.appearanceDigest,
          timesToRepeat,
          title: rollTitle || undefined,
        }),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json();
      if (!isCurrent()) return;

      if (response.status === 409) {
        setPreparation({
          status: "error",
          message: "Prepared appearance has changed; prepare the roll again",
        });
        throw new Error("Prepared appearance has changed; prepare the roll again");
      }
      const data = parseWebRollResponse(responseBody);
      if (data.error === "PERMISSION_ERROR") {
        toast({
          title: "Missing Discord Permissions",
          description:
            "I need permission to read message history, attach files, and embed links to show you the dice 😊",
          variant: "destructive",
        });
      }
      setRollResults(data);
      if (data.error === undefined) {
        setInput("");
        setRollTitle("");
        setTimesToRepeat(1);
        setPreparation({ status: "idle" });
        stableRenderSeed.current = undefined;
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Error rolling dice:", error);
      toast({
        title: "Error Rolling Dice",
        description: "Something went wrong when trying to roll. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (revision === rollRequestRevision.current) {
        activeRollController.current = null;
        setIsRolling(false);
      }
    }
  };

  const handleTimesToRepeatChange = (value: number) => {
    cancelActiveRoll();
    setTimesToRepeat(value);
    setPreparation({ status: "idle" });
  };

  if (isLoading || isFetching) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center"
      >
        <LoaderIcon className="h-8 w-8 text-muted-foreground motion-safe:animate-spin" />
        <span className="sr-only">Loading servers</span>
      </div>
    );
  }

  const authorizedGuilds = Array.isArray(mutualGuilds)
    ? mutualGuilds.filter(
        ({ isAdmin, isDiceWitchAdmin }) => isAdmin || isDiceWitchAdmin,
      )
    : [];
  const hasAdminPermissions = authorizedGuilds.length > 0;
  const hasNoGuilds = !Array.isArray(mutualGuilds) || mutualGuilds.length === 0;

  if (hasNoGuilds && !isLoading && !isFetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-semibold text-center text-muted-foreground max-w-lg mb-6">
          You don't have any mutual servers with Dice Witch
        </h1>
        <a
          href={appConfig.inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded"
        >
          Add Dice Witch to a server
        </a>
      </div>
    );
  }

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
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 sm:px-4">
        <header className="mx-auto flex w-full max-w-6xl flex-none items-center justify-center gap-4 pb-2">
          <div className="hidden w-[clamp(7.5rem,16dvh,9rem)] shrink-0 overflow-visible sm:block">
            <LoadingMedia
              staticImage="/images/dice-witch-banner.webp"
              loadingVideo="/videos/dice-witch-loading.mp4"
              className="h-auto w-full rounded-full"
              isLoading={isRolling}
              alt="Dice Witch"
              blendMode="normal"
              hideText
            />
          </div>

          <div className="grid w-[300px] gap-2">
            <GuildDropdown
              guilds={authorizedGuilds}
              value={selectedGuild}
              onValueChange={(value) => {
                cancelActiveRoll();
                setSelectedGuild(value);
                setSelectedChannel(undefined);
                setRollResults(null);
                setVisiblePreparation(null);
                stableRenderSeed.current = undefined;
                setPreparation({ status: "idle" });
              }}
            />
            {selectedGuild && Array.isArray(channels) && channels.length > 0 && (
              <ChannelDropdown
                channels={channels}
                value={selectedChannel}
                onValueChange={(value) => {
                  cancelActiveRoll();
                  setSelectedChannel(value);
                  setRollResults(null);
                }}
              />
            )}
          </div>
        </header>

        {selectedGuild && (
          <section className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2">
            <div className="min-h-0 flex-1">
              <Roller
                rollPreparation={visiblePreparation}
                rollResults={rollResults}
                isPreparing={preparation.status === "loading"}
                isRolling={isRolling}
                isResultStale={rollResults !== null && input.trim() !== ""}
                input={input}
                setInput={handleInputChange}
                selectedChannel={!!selectedChannel}
              />
            </div>
            {preparation.status === "error" && (
              <div
                role="alert"
                className="flex flex-none items-center justify-center gap-3 rounded-md border border-amber-500/60 px-3 py-2 text-sm"
              >
                <span>{preparation.message}</span>
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setPreparationRetry((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            <div className="flex-none">
              <DiceInput
                input={input}
                setInput={handleInputChange}
                isValid={isValid}
                onRoll={handleRollDice}
                timesToRepeat={timesToRepeat}
                onTimesToRepeatChange={handleTimesToRepeatChange}
                selectedChannel={!!selectedChannel}
                isRollReady={preparation.status === "ready"}
                rollTitle={rollTitle}
                onRollTitleChange={setRollTitle}
              />
            </div>
          </section>
        )}
      </div>
    </TooltipProvider>
  );
};

export default Home;