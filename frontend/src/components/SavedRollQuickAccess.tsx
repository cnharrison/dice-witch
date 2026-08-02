import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dices, Paintbrush, PanelRightClose, Search } from "lucide-react";
import { LibraryRollName } from "@/components/LibraryRollName";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RecentRoll } from "@/lib/recent-rolls";
import {
  listSavedRolls,
  savedRollQueryKey,
  SavedRollApiError,
  type SavedRoll,
  type SavedRollScope,
} from "@/lib/saved-rolls";
import { cn } from "@/lib/utils";

type LibraryTab = "personal" | "guild";

type RecentBadge = "Personal" | "Server" | null;

function recentBadge(roll: RecentRoll): RecentBadge {
  if (roll.libraryRoll === undefined) return null;
  return roll.libraryRoll.scope === "personal" ? "Personal" : "Server";
}

export type QuickRollComposition = Readonly<{
  notation: string;
  title: string | null;
  repetitions: number;
  libraryRoll?: Readonly<{
    scope: "personal" | "server";
    id: string;
    revision: number;
  }>;
  libraryDisplayName?: string;
  libraryNameColor?: string | null;
}>;

export function SavedRollQuickAccess({
  guildScope,
  recentRolls,
  stagingReady,
  destinationReady,
  onLoad,
  onRollNow,
  onClearRecent,
  onCollapse,
  className,
}: Readonly<{
  guildScope: SavedRollScope | null;
  recentRolls: readonly RecentRoll[];
  stagingReady: boolean;
  destinationReady: boolean;
  onLoad: (composition: QuickRollComposition) => void;
  onRollNow: (composition: QuickRollComposition) => void;
  onClearRecent: () => void;
  onCollapse?: () => void;
  className?: string;
}>) {
  const personalScope: SavedRollScope = { type: "personal" };
  const personal = useQuery({
    queryKey: savedRollQueryKey(personalScope),
    queryFn: () => listSavedRolls(personalScope),
  });
  const server = useQuery({
    queryKey:
      guildScope === null
        ? ["saved-rolls", "guild", "none"]
        : savedRollQueryKey(guildScope),
    queryFn: () => {
      if (guildScope === null) throw new Error("Server library is missing");
      return listSavedRolls(guildScope);
    },
    enabled: guildScope !== null,
  });
  const [activeTab, setActiveTab] = React.useState<LibraryTab>("personal");
  const [search, setSearch] = React.useState("");
  const hasServerRolls = (server.data?.savedRolls.length ?? 0) > 0;
  const showLibrarySwitcher =
    guildScope !== null && (hasServerRolls || server.isError);

  React.useEffect(() => {
    if (
      activeTab === "guild" &&
      (guildScope === null || (server.isSuccess && !hasServerRolls))
    ) {
      setActiveTab("personal");
    }
  }, [activeTab, guildScope, hasServerRolls, server.isSuccess]);

  const activeQuery = activeTab === "personal" ? personal : server;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRolls = (activeQuery.data?.savedRolls ?? []).filter((savedRoll) =>
    `${savedRoll.displayName} ${savedRoll.notation} ${savedRoll.title ?? ""}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );

  return (
    <TooltipProvider>
      <section
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background",
          className,
        )}
        aria-label="Library"
      >
      <header className="flex items-center justify-between gap-2 border-b p-2">
        <h2 id="library-quick-heading" className="font-semibold">Library</h2>
        {onCollapse !== undefined && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Collapse library"
            onClick={onCollapse}
          >
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </header>

      {showLibrarySwitcher && (
        <div
          role="tablist"
          aria-label="Library"
          className="grid grid-cols-2 gap-1 border-b p-2"
        >
          {(["personal", "guild"] as const).map((tab) => {
            const selected = activeTab === tab;
            const label = tab === "personal" ? "Personal" : "Server";
            return (
              <button
                key={tab}
                id={`library-${tab}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`library-${tab}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const next = tab === "personal" ? "guild" : "personal";
                  setActiveTab(next);
                  document.getElementById(`library-${next}-tab`)?.focus();
                }}
                className={cn(
                  "h-10 rounded-md px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="border-b p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search library"
            placeholder="Search"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div
        id={`library-${activeTab}-panel`}
        role={showLibrarySwitcher ? "tabpanel" : undefined}
        aria-labelledby={
          showLibrarySwitcher ? `library-${activeTab}-tab` : "library-quick-heading"
        }
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {normalizedSearch === "" && recentRolls.length > 0 && (
          <section className="mb-3 border-b pb-3" aria-labelledby="recent-rolls-heading">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 id="recent-rolls-heading" className="text-sm font-semibold">Recent</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Clear recent rolls"
                    onClick={() => {
                      if (window.confirm("Clear recent rolls?")) onClearRecent();
                    }}
                  >
                    <Paintbrush className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear recent rolls</TooltipContent>
              </Tooltip>
            </div>
            <RollList
              entries={recentRolls.map((roll, index) => ({
                id: `recent-${String(index)}`,
                name: roll.libraryRoll?.displayName ?? roll.title ?? roll.notation,
                color: roll.libraryRoll?.nameColor ?? null,
                badge: recentBadge(roll),
                preserveLibraryOnLoad: roll.libraryRoll !== undefined,
                composition: {
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
                },
              }))}
              stagingReady={stagingReady}
              destinationReady={destinationReady}
              onLoad={onLoad}
              onRollNow={onRollNow}
            />
          </section>
        )}

        {activeQuery.isLoading && (
          <SparkleLoadingIndicator label="Loading library" className="min-h-24" />
        )}
        {activeQuery.error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {activeQuery.error instanceof SavedRollApiError
              ? activeQuery.error.message
              : "The library is temporarily unavailable."}
          </p>
        )}
        <RollList
          entries={visibleRolls.map((savedRoll) =>
            savedRollEntry(savedRoll, activeTab),
          )}
          stagingReady={stagingReady}
          destinationReady={destinationReady}
          onLoad={onLoad}
          onRollNow={onRollNow}
        />
        </div>
      </section>
    </TooltipProvider>
  );
}

function RollList({
  entries,
  stagingReady,
  destinationReady,
  onLoad,
  onRollNow,
}: Readonly<{
  entries: readonly Readonly<{
    id: string;
    name: string;
    color: string | null;
    badge?: "Personal" | "Server" | null;
    preserveLibraryOnLoad?: boolean;
    composition: QuickRollComposition;
  }>[];
  stagingReady: boolean;
  destinationReady: boolean;
  onLoad: (composition: QuickRollComposition) => void;
  onRollNow: (composition: QuickRollComposition) => void;
}>) {
  return (
    <ul className="grid gap-1">
      {entries.map((entry) => (
        <li key={entry.id} className="grid min-w-0 grid-cols-[1fr_auto] items-stretch gap-1">
          <button
            type="button"
            className="min-w-0 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Load ${entry.name}`}
            disabled={!stagingReady}
            onClick={() =>
              onLoad(
                entry.preserveLibraryOnLoad
                  ? entry.composition
                  : {
                      notation: entry.composition.notation,
                      title: entry.composition.title,
                      repetitions: entry.composition.repetitions,
                    },
              )
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <LibraryRollName color={entry.color} className="min-w-0 truncate text-sm font-semibold">
                {entry.name}
              </LibraryRollName>
              {entry.badge && (
                <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                  {entry.badge}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <span className="truncate">{entry.composition.notation}</span>
              {entry.composition.repetitions > 1 && (
                <span className="rounded-full border px-1.5 py-0.5 font-sans">
                  Repeat ×{String(entry.composition.repetitions)}
                </span>
              )}
            </span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-full min-h-11"
                aria-label={`Roll ${entry.name} now`}
                disabled={!destinationReady}
                onClick={() => onRollNow(entry.composition)}
              >
                <Dices className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Send this saved roll immediately to your selected Discord channel.
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function savedRollEntry(savedRoll: SavedRoll, scope: LibraryTab) {
  return {
    id: savedRoll.id,
    name: savedRoll.displayName,
    color: savedRoll.nameColor,
    composition: {
      notation: savedRoll.notation,
      title: savedRoll.title,
      repetitions: savedRoll.repetitions,
      libraryRoll: {
        scope: scope === "personal" ? "personal" : "server",
        id: savedRoll.id,
        revision: savedRoll.revision,
      },
      libraryDisplayName: savedRoll.displayName,
      libraryNameColor: savedRoll.nameColor,
    },
  };
}
