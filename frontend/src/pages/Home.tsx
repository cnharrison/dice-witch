import { DiceInput } from '@/components/DiceInput';
import { GuildDropdown } from '@/components/GuildDropdown';
import { ChannelDropdown } from '@/components/ChannelDropdown';
import { Roller } from '@/components/Roller';
import { LoadingMedia } from '@/components/LoadingMedia';
import diceWitchPortrait from "@/assets/dice-witch-banner.webp";
import {
  SavedRollQuickAccess,
  type QuickRollComposition,
} from '@/components/SavedRollQuickAccess';
import { SaveLibraryRollDialog } from '@/components/SaveLibraryRollDialog';
import { SparkleLoadingIndicator } from '@/components/SparkleLoadingIndicator';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import type { Channel, RollerGuild } from "@/types/guild";
import type { RollPreparation, RollResponse } from '@/types/dice';
import type { SavedRollScope } from '@/lib/saved-rolls';
import { useUser } from '@/lib/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, PanelRightOpen } from "lucide-react";
import * as React from 'react';
import type { ImperativePanelHandle } from "react-resizable-panels";
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useBrowserMediaQueryV4 } from '@/components/dice-v4-3d/browser-media';
import { cn } from '@/lib/utils';
import { useGuild } from '@/context/GuildContext';
import { useToast } from '@/hooks/use-toast';
import { customFetch } from '../lib/api';
import { appConfig } from '@/lib/config';
import {
  guildChannelsQueryKey,
  listGuildChannels,
  listRollerGuilds,
  ROLLER_GUILDS_QUERY_KEY,
} from '@/lib/guilds';
import {
  addRecentRoll,
  clearRecentRolls,
  readRecentRolls,
  type RecentRoll,
} from "@/lib/recent-rolls";
import {
  parseWebRollPreparation,
  parseWebRollResponse,
} from '@/lib/roll-response';

type RollPreparationState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: RollPreparation };

type MobileRollTab = "roll" | "saved" | "result";
type LibraryRollSelection = NonNullable<QuickRollComposition["libraryRoll"]>;
type ActiveLibraryRoll = Readonly<{
  selection: LibraryRollSelection;
  displayName: string;
  nameColor: string | null;
}>;

const MOBILE_QUERY = "(max-width: 639px)";
const MOBILE_TABS: ReadonlyArray<{ id: MobileRollTab; label: string }> = [
  { id: "roll", label: "Roll" },
  { id: "saved", label: "Library" },
  { id: "result", label: "Result" },
];

function focusVisibleNotationInput(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    'input[aria-label="Dice notation"]',
  );
  [...inputs].find((input) => input.offsetParent !== null)?.focus();
}

function recentComposition(roll: RecentRoll): QuickRollComposition {
  return {
    notation: roll.notation,
    title: roll.title,
    repetitions: roll.repetitions,
    ...(roll.libraryRoll === undefined
      ? {}
      : {
          libraryRoll: {
            scope: roll.libraryRoll.scope,
            id: roll.libraryRoll.id,
            revision: roll.libraryRoll.revision,
          },
          libraryDisplayName: roll.libraryRoll.displayName,
          libraryNameColor: roll.libraryRoll.nameColor,
        }),
  };
}

function MobileRollTabs({
  active,
  onChange,
}: {
  active: MobileRollTab;
  onChange: (tab: MobileRollTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Roll workspace"
      className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
    >
      {MOBILE_TABS.map(({ id, label }, index) => (
        <button
          key={id}
          id={`mobile-${id}-tab`}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-controls={`mobile-${id}-panel`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const offset = event.key === "ArrowRight" ? 1 : -1;
            const next = MOBILE_TABS[
              (index + offset + MOBILE_TABS.length) % MOBILE_TABS.length
            ]?.id;
            if (next === undefined) return;
            onChange(next);
            document.getElementById(`mobile-${next}-tab`)?.focus();
          }}
          className={cn(
            "h-11 rounded px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export const Home = () => {
  const { user } = useUser();
  const {
    selectedGuildId: selectedGuild,
    selectedChannelId: selectedChannel,
    setSelectedGuildId: setSelectedGuild,
    setSelectedChannelId: setSelectedChannel
  } = useGuild();
  const { input, setInput, isValid, diceInfo, validatedInput } = useDiceValidation('');
  const isMobile = useBrowserMediaQueryV4(MOBILE_QUERY);
  const [mobileTab, setMobileTab] = React.useState<MobileRollTab>("roll");
  const [destinationOpen, setDestinationOpen] = React.useState(false);
  const [savedRollsCollapsed, setSavedRollsCollapsed] = React.useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [recentRolls, setRecentRolls] = React.useState<RecentRoll[]>([]);
  const [queuedRoll, setQueuedRoll] = React.useState<QuickRollComposition | null>(null);
  const savedRollsPanel = React.useRef<ImperativePanelHandle>(null);
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
  const pendingDelivery = React.useRef<{
    id: string;
    requestKey: string;
  } | null>(null);
  const activeLibraryRoll = React.useRef<ActiveLibraryRoll | undefined>(
    undefined,
  );
  const historyIndex = React.useRef(-1);
  const historyDraft = React.useRef<QuickRollComposition | null>(null);

  const resetHistoryNavigation = React.useCallback(() => {
    historyIndex.current = -1;
    historyDraft.current = null;
  }, []);

  const cancelActiveRoll = React.useCallback(() => {
    rollRequestRevision.current += 1;
    activeRollController.current?.abort();
    activeRollController.current = null;
    pendingDelivery.current = null;
    activeLibraryRoll.current = undefined;
    setIsRolling(false);
  }, []);

  React.useEffect(
    () => () => {
      rollRequestRevision.current += 1;
      activeRollController.current?.abort();
    },
    [],
  );

  React.useEffect(() => {
    if (user?.id === undefined) {
      setRecentRolls([]);
      return;
    }
    setRecentRolls(readRecentRolls(window.localStorage, user.id));
  }, [user?.id]);

  const { data: mutualGuilds, isLoading, isFetching } = useQuery<RollerGuild[]>({
    queryKey: ROLLER_GUILDS_QUERY_KEY,
    queryFn: listRollerGuilds,
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const handleInputChange = (value: string) => {
    resetHistoryNavigation();
    cancelActiveRoll();
    setInput(value);
    setPreparation({ status: "idle" });
    if (!value) {
      setIsRolling(false);
      setVisiblePreparation(null);
      stableRenderSeed.current = undefined;
    }
  };

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: guildChannelsQueryKey(selectedGuild ?? ""),
    queryFn: () => {
      if (selectedGuild === undefined) {
        throw new Error("A guild is required to load channels");
      }
      return listGuildChannels(selectedGuild);
    },
    enabled: selectedGuild !== undefined,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

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

  const handleRollDice = React.useCallback(async () => {
    if (
      !isValid ||
      !selectedGuild ||
      !selectedChannel ||
      !input ||
      preparation.status !== "ready"
    ) {
      return;
    }

    if (isMobile) setMobileTab("result");
    activeRollController.current?.abort();
    const controller = new AbortController();
    activeRollController.current = controller;
    const revision = ++rollRequestRevision.current;
    const isCurrent = () =>
      !controller.signal.aborted && revision === rollRequestRevision.current;

    try {
      setIsRolling(true);
      const activeLibrary = activeLibraryRoll.current;
      const libraryRoll = activeLibrary?.selection;
      const requestKey = JSON.stringify({
        guildId: selectedGuild,
        channelId: selectedChannel,
        notation: input,
        renderSeed: preparation.value.renderSeed,
        appearanceDigest: preparation.value.appearanceDigest,
        timesToRepeat,
        title: rollTitle || null,
        libraryRoll: libraryRoll ?? null,
      });
      const deliveryId =
        pendingDelivery.current?.requestKey === requestKey
          ? pendingDelivery.current.id
          : crypto.randomUUID();
      pendingDelivery.current = { id: deliveryId, requestKey };

      const response = await customFetch("/api/dice/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId,
          guildId: selectedGuild,
          channelId: selectedChannel,
          notation: input,
          renderSeed: preparation.value.renderSeed,
          appearanceDigest: preparation.value.appearanceDigest,
          timesToRepeat,
          title: rollTitle || undefined,
          ...(libraryRoll === undefined ? {} : { libraryRoll }),
        }),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json();
      if (!isCurrent()) return;
      if (response.status !== 503) {
        pendingDelivery.current = null;
        activeLibraryRoll.current = undefined;
      }

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
        const recentRoll = {
          notation: input,
          title: rollTitle.trim() === "" ? null : rollTitle,
          repetitions: timesToRepeat,
          ...(activeLibrary === undefined
            ? {}
            : {
                libraryRoll: {
                  ...activeLibrary.selection,
                  displayName: activeLibrary.displayName,
                  nameColor: activeLibrary.nameColor,
                },
              }),
        } satisfies RecentRoll;
        if (user?.id !== undefined) {
          try {
            setRecentRolls(addRecentRoll(window.localStorage, user.id, recentRoll));
            resetHistoryNavigation();
          } catch (error) {
            console.error("Could not persist the recent roll", error);
          }
        }
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
  }, [
    input,
    isMobile,
    isValid,
    preparation,
    rollTitle,
    selectedChannel,
    selectedGuild,
    setInput,
    timesToRepeat,
    toast,
    resetHistoryNavigation,
    user?.id,
  ]);

  React.useEffect(() => {
    const shortcuts = (event: KeyboardEvent): void => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!editing && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        focusVisibleNotationInput();
      }
      const notationInput = target instanceof HTMLInputElement &&
        target.getAttribute("aria-label") === "Dice notation";
      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        (!editing || notationInput)
      ) {
        event.preventDefault();
        void handleRollDice();
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [handleRollDice]);

  React.useEffect(() => {
    if (
      queuedRoll === null ||
      preparation.status !== "ready" ||
      input !== queuedRoll.notation ||
      rollTitle !== (queuedRoll.title ?? "") ||
      timesToRepeat !== queuedRoll.repetitions
    ) return;
    setQueuedRoll(null);
    void handleRollDice();
  }, [handleRollDice, input, preparation, queuedRoll, rollTitle, timesToRepeat]);

  const handleRollTitleChange = (value: string) => {
    resetHistoryNavigation();
    activeLibraryRoll.current = undefined;
    setQueuedRoll(null);
    setRollTitle(value);
  };

  const handleTimesToRepeatChange = (value: number) => {
    resetHistoryNavigation();
    cancelActiveRoll();
    setTimesToRepeat(value);
    setPreparation({ status: "idle" });
  };

  const allGuilds = mutualGuilds ?? [];
  const availableGuilds = allGuilds.filter(({ isRollable }) => isRollable);
  const manageableGuilds = allGuilds.filter(
    ({ isAdmin, isDiceWitchAdmin }) => isAdmin || isDiceWitchAdmin,
  );
  const hasNoGuilds = availableGuilds.length === 0;
  const selectedGuildRecord = availableGuilds.find(
    ({ guilds }) => guilds.id === selectedGuild,
  );
  const selectedChannelRecord = channels.find(
    ({ id }) => id === selectedChannel,
  );
  const savedRollGuildScope: SavedRollScope | null =
    selectedGuildRecord === undefined
      ? null
      : {
          type: "guild",
          guildId: selectedGuildRecord.guilds.id,
          guildName: selectedGuildRecord.guilds.name,
        };

  const selectGuild = (value: string) => {
    resetHistoryNavigation();
    cancelActiveRoll();
    setSelectedGuild(value);
    setSelectedChannel(undefined);
    setRollResults(null);
    setVisiblePreparation(null);
    stableRenderSeed.current = undefined;
    setPreparation({ status: "idle" });
  };

  const selectChannel = (value: string) => {
    resetHistoryNavigation();
    cancelActiveRoll();
    setSelectedChannel(value);
    setRollResults(null);
  };

  const loadComposition = (
    composition: QuickRollComposition,
    rollNow = false,
    resetHistory = true,
  ) => {
    let libraryRoll: ActiveLibraryRoll | undefined;
    if (composition.libraryRoll !== undefined) {
      if (composition.libraryDisplayName === undefined) {
        throw new Error("Library roll display name is missing");
      }
      libraryRoll = {
        selection: composition.libraryRoll,
        displayName: composition.libraryDisplayName,
        nameColor: composition.libraryNameColor ?? null,
      };
    }
    if (resetHistory) resetHistoryNavigation();
    cancelActiveRoll();
    if (isMobile) setMobileTab("roll");
    setInput(composition.notation);
    setRollTitle(composition.title ?? "");
    setTimesToRepeat(composition.repetitions);
    setRollResults(null);
    setVisiblePreparation(null);
    stableRenderSeed.current = undefined;
    setPreparation({ status: "idle" });
    activeLibraryRoll.current = libraryRoll;
    setQueuedRoll(rollNow ? composition : null);
    window.setTimeout(focusVisibleNotationInput, 0);
  };

  const navigateHistory = (direction: "previous" | "next") => {
    if (recentRolls.length === 0) return;
    if (historyIndex.current < 0) {
      if (direction === "next") return;
      const activeLibrary = activeLibraryRoll.current;
      historyDraft.current = {
        notation: input,
        title: rollTitle.trim() === "" ? null : rollTitle,
        repetitions: timesToRepeat,
        ...(activeLibrary === undefined
          ? {}
          : {
              libraryRoll: activeLibrary.selection,
              libraryDisplayName: activeLibrary.displayName,
              libraryNameColor: activeLibrary.nameColor,
            }),
      };
    }
    const nextIndex = direction === "previous"
      ? Math.min(historyIndex.current + 1, recentRolls.length - 1)
      : historyIndex.current - 1;
    historyIndex.current = nextIndex;
    let composition = historyDraft.current;
    if (nextIndex >= 0) {
      const recentRoll = recentRolls[nextIndex];
      if (recentRoll === undefined) return;
      composition = recentComposition(recentRoll);
    }
    if (composition !== null) loadComposition(composition, false, false);
  };

  if (isLoading || isFetching) {
    return <SparkleLoadingIndicator label="Loading servers" className="min-h-screen" />;
  }

  if (hasNoGuilds && !isLoading && !isFetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-semibold text-center text-muted-foreground max-w-lg mb-6">
          {allGuilds.length === 0
            ? "You don't have any mutual servers with Dice Witch"
            : "You don't have any servers with a channel available for Dice Witch rolls"}
        </h1>
        <a
          href={appConfig.inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-discord px-4 py-2 text-discord-foreground hover:bg-discord-hover"
        >
          Add Dice Witch to a server
        </a>
      </div>
    );
  }

  const diceInput = (
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
      onRollTitleChange={handleRollTitleChange}
      onHistoryPrevious={() => navigateHistory("previous")}
      onHistoryNext={() => navigateHistory("next")}
    />
  );
  const compositionBar = (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">{diceInput}</div>
      <Button
        type="button"
        variant="brand"
        className="shrink-0"
        disabled={!selectedChannel || input.trim() === ""}
        onClick={() => setSaveDialogOpen(true)}
      >
        <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
        Save
      </Button>
    </div>
  );
  const preparationError = preparation.status === "error" && (
    <div
      role="alert"
      className="flex flex-none items-center justify-center gap-3 rounded-md border border-warning-border bg-warning px-3 py-2 text-sm text-warning-foreground"
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
  );
  const renderRoller = (mobileView: "controls" | "result") => (
    <Roller
      rollPreparation={visiblePreparation}
      rollResults={rollResults}
      isPreparing={preparation.status === "loading"}
      isRolling={isRolling}
      isResultStale={rollResults !== null && input.trim() !== ""}
      input={input}
      setInput={handleInputChange}
      selectedChannel={!!selectedChannel}
      mobileView={mobileView}
    />
  );
  const renderSavedRolls = (onCollapse?: () => void) => (
    <SavedRollQuickAccess
      guildScope={savedRollGuildScope}
      recentRolls={recentRolls}
      stagingReady={selectedGuild !== undefined}
      destinationReady={selectedGuild !== undefined && selectedChannel !== undefined}
      onLoad={(composition) => loadComposition(composition)}
      onRollNow={(composition) => loadComposition(composition, true)}
      onClearRecent={() => {
        if (user?.id === undefined) return;
        try {
          clearRecentRolls(window.localStorage, user.id);
        } catch (error) {
          console.error("Could not clear recent rolls", error);
          return;
        }
        setRecentRolls([]);
        resetHistoryNavigation();
      }}
      onCollapse={onCollapse}
    />
  );

  return (
    <TooltipProvider>
      <>
        <SaveLibraryRollDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          composition={{ notation: input, title: rollTitle, repetitions: timesToRepeat }}
          manageableGuilds={manageableGuilds}
        />
        <div className="roller-workspace flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 sm:px-4">
        {isMobile ? (
          <>
            <header className="flex-none pb-2">
              <Button
                type="button"
                variant="outline"
                className="flex h-auto min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
                aria-label="Change roll destination"
                onClick={() => setDestinationOpen(true)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {selectedGuildRecord?.guilds.name ?? "Select server"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {selectedChannelRecord === undefined
                      ? "Select channel"
                      : `#${selectedChannelRecord.name}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">Change</span>
              </Button>
              <Dialog open={destinationOpen} onOpenChange={setDestinationOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Roll destination</DialogTitle>
                    <DialogDescription>
                      Choose the Discord server and channel for web rolls.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <GuildDropdown
                      guilds={availableGuilds}
                      value={selectedGuild}
                      onValueChange={selectGuild}
                      ariaLabel="Server"
                      triggerClassName="w-full"
                      contentClassName="min-w-[var(--radix-select-trigger-width)]"
                    />
                    {selectedGuild && channels.length > 0 && (
                      <ChannelDropdown
                        channels={channels}
                        value={selectedChannel}
                        onValueChange={(value) => {
                          selectChannel(value);
                          setDestinationOpen(false);
                        }}
                        ariaLabel="Channel"
                        triggerClassName="w-full"
                        contentClassName="min-w-[var(--radix-select-trigger-width)]"
                      />
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </header>

            <section className="flex min-h-0 flex-1 flex-col gap-2">
                <MobileRollTabs active={mobileTab} onChange={setMobileTab} />
                <div
                  id={`mobile-${mobileTab}-panel`}
                  role="tabpanel"
                  aria-labelledby={`mobile-${mobileTab}-tab`}
                  className="min-h-0 flex-1"
                >
                  {mobileTab === "roll" && (
                    <div className="flex h-full min-h-0 flex-col gap-2">
                      <div className="flex-none">{compositionBar}</div>
                      {preparationError}
                      <div className="min-h-0 flex-1">{renderRoller("controls")}</div>
                    </div>
                  )}
                  {mobileTab === "saved" && renderSavedRolls()}
                  {mobileTab === "result" && (
                    <div className="flex h-full min-h-0 flex-col gap-2">
                      <div className="min-h-0 flex-1">{renderRoller("result")}</div>
                      {preparationError}
                    </div>
                  )}
                </div>
              </section>
          </>
        ) : (
          <>
            <header className="mx-auto flex w-full max-w-7xl flex-none items-center justify-center gap-4 pb-2">
              <div className="w-[clamp(7.5rem,16dvh,9rem)] shrink-0 overflow-visible">
                <LoadingMedia
                  staticImage={diceWitchPortrait}
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
                  guilds={availableGuilds}
                  value={selectedGuild}
                  onValueChange={selectGuild}
                />
                {selectedGuild && channels.length > 0 && (
                  <ChannelDropdown
                    channels={channels}
                    value={selectedChannel}
                    onValueChange={selectChannel}
                  />
                )}
              </div>
            </header>

            <section className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-2">
              <div className="relative min-h-0 flex-1">
                <ResizablePanelGroup
                  direction="horizontal"
                  autoSaveId="dice-witch-roller-saved-rolls-v1"
                  className="min-h-0"
                >
                  <ResizablePanel order={1} defaultSize={76} minSize={55}>
                    <div className="flex h-full min-h-0 flex-col gap-2 pr-2">
                      <div className="min-h-0 flex-1">{renderRoller("controls")}</div>
                      {preparationError}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    ref={savedRollsPanel}
                    order={2}
                    defaultSize={24}
                    minSize={18}
                    maxSize={40}
                    collapsible
                    collapsedSize={0}
                    onCollapse={() => setSavedRollsCollapsed(true)}
                    onExpand={() => setSavedRollsCollapsed(false)}
                  >
                    <div className="h-full min-h-0 pl-2">
                      {renderSavedRolls(() => savedRollsPanel.current?.collapse())}
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
                {savedRollsCollapsed && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-2 z-20 shadow-md"
                    aria-label="Open library"
                    onClick={() => savedRollsPanel.current?.expand()}
                  >
                    <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <div className="flex-none">{compositionBar}</div>
            </section>
          </>
        )}
        </div>
      </>
    </TooltipProvider>
  );
};

export default Home;