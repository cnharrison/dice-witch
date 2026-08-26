import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { Copy, GripHorizontal, Plus, Save, Trash2 } from "lucide-react";
import { LibraryRollColorPicker } from "@/components/LibraryRollColorPicker";
import { SavedRollGrid, type SavedRollGridRow } from "@/components/SavedRollGrid";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { SavedRollLibrarySelect } from "@/components/SavedRollLibrarySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customFetch } from "@/lib/api";
import {
  copySavedRoll,
  createSavedRoll,
  deleteSavedRoll,
  deleteSavedRollBatch,
  listSavedRollLibraries,
  listSavedRolls,
  reorderSavedRolls,
  savedRollDraft,
  savedRollQueryKey,
  searchSavedRolls,
  SavedRollApiError,
  updateSavedRoll,
  type SavedRoll,
  type SavedRollApi,
  type SavedRollDraft,
  type SavedRollMutation,
  type SavedRollScope,
  type SavedRollSearchSort,
} from "@/lib/saved-rolls";
import { useUser } from "@/lib/AuthProvider";
import type { Guild } from "@/types/guild";

const emptyDraft: SavedRollDraft = {
  version: 2,
  name: "",
  nameColor: null,
  notation: "",
  title: null,
  repetitions: 1,
};

function mutationMessage(result: SavedRollMutation): string | null {
  switch (result.status) {
    case "applied":
    case "existing":
      return null;
    case "name_conflict":
      return "That name is already used in this library.";
    case "cap_reached":
      return `This library has reached its ${String(result.limit)} roll limit.`;
    case "list_revision_conflict":
    case "record_revision_conflict":
    case "record_set_conflict":
      return "This library changed in another session. It has been refreshed.";
    case "unauthorized":
      return "Your permission to manage this server library changed.";
    case "missing":
      return "This library roll no longer exists.";
    case "mutation_conflict":
      return "This action conflicts with an earlier request.";
  }
}

function errorMessage(error: Error): string {
  return error instanceof SavedRollApiError
    ? error.message
    : "The library is temporarily unavailable.";
}

function DraftEditor({
  initial,
  submitting,
  usedColors,
  onCancel,
  onSubmit,
}: {
  initial: SavedRollDraft;
  submitting: boolean;
  usedColors: readonly string[];
  onCancel?: () => void;
  onSubmit: (draft: SavedRollDraft) => void;
}) {
  const [draft, setDraft] = React.useState(initial);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...draft,
      title: draft.title === "" ? null : draft.title,
    });
  };

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="saved-roll-name">Name</Label>
        <Input
          id="saved-roll-name"
          value={draft.name}
          required
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Roll name color</Label>
        <LibraryRollColorPicker
          value={draft.nameColor}
          usedColors={usedColors}
          disabled={submitting}
          onChange={(nameColor) => setDraft({ ...draft, nameColor })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="saved-roll-notation">Dice notation</Label>
        <Input
          id="saved-roll-notation"
          value={draft.notation}
          maxLength={6_000}
          required
          onChange={(event) =>
            setDraft({ ...draft, notation: event.target.value })
          }
        />
      </div>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="saved-roll-title">Roll title (optional)</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Use library name as roll title"
              disabled={submitting || draft.name.trim() === ""}
              onClick={() => setDraft({ ...draft, title: draft.name })}
            >
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Use name
            </Button>
          </div>
          <Input
            id="saved-roll-title"
            value={draft.title ?? ""}
            maxLength={256}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="saved-roll-repetitions">Repetitions</Label>
          <Input
            id="saved-roll-repetitions"
            type="number"
            min={1}
            max={50}
            value={draft.repetitions}
            onChange={(event) =>
              setDraft({
                ...draft,
                repetitions: Number(event.target.value),
              })
            }
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel !== undefined && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

type DialogPosition = Readonly<{ x: number; y: number }>;
type DialogDrag = Readonly<{
  pointerId: number;
  startX: number;
  startY: number;
  position: DialogPosition;
  bounds: DOMRect;
}>;

function clampDragDelta(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (minimum > maximum) return 0;
  return Math.min(Math.max(value, minimum), maximum);
}

function DraggableLibraryDialog({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DialogDrag | null>(null);
  const [position, setPosition] = React.useState<DialogPosition>({ x: 0, y: 0 });

  React.useEffect(() => {
    const resetOnMobile = () => {
      if (window.innerWidth >= 640) return;
      dragRef.current = null;
      setPosition({ x: 0, y: 0 });
    };
    window.addEventListener("resize", resetOnMobile);
    return () => window.removeEventListener("resize", resetOnMobile);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 640 || event.button !== 0) return;
    const bounds = contentRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position,
      bounds,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const margin = 8;
    const deltaX = clampDragDelta(
      event.clientX - drag.startX,
      margin - drag.bounds.left,
      window.innerWidth - margin - drag.bounds.right,
    );
    const deltaY = clampDragDelta(
      event.clientY - drag.startY,
      margin - drag.bounds.top,
      window.innerHeight - margin - drag.bounds.bottom,
    );
    setPosition({
      x: drag.position.x + deltaX,
      y: drag.position.y + deltaY,
    });
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <DialogContent
      ref={contentRef}
      style={{
        transform: `translate(calc(-50% + ${String(position.x)}px), calc(-50% + ${String(position.y)}px))`,
      }}
    >
      <DialogHeader
        data-testid="library-dialog-drag-handle"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="select-none pr-8 sm:cursor-grab sm:active:cursor-grabbing"
      >
        <DialogTitle className="flex items-center gap-2">
          <GripHorizontal
            className="hidden h-4 w-4 text-brand sm:block"
            aria-hidden="true"
          />
          {title}
        </DialogTitle>
      </DialogHeader>
      {children}
    </DialogContent>
  );
}

function scopeForRow(row: SavedRollGridRow): SavedRollScope {
  return row.source.type === "personal"
    ? { type: "personal" }
    : {
        type: "guild",
        guildId: row.source.guildId,
        guildName: row.source.guildName,
      };
}

function scopeKey(scope: SavedRollScope): string {
  return scope.type === "personal" ? "personal" : `guild:${scope.guildId}`;
}

function copyConflictName(
  name: string,
  source: SavedRollScope,
  target: SavedRollScope,
): string {
  if (source.type === "guild") return `${name} (${source.guildName})`;
  if (target.type === "guild") return `${name} (${target.guildName})`;
  throw new Error("A library copy must include one server library");
}

export interface SavedRollsDependencies {
  useUserId: () => string | undefined;
  fetchResponse: typeof customFetch;
  api: SavedRollApi;
}

export function SavedRollsView({
  dependencies,
}: {
  dependencies: SavedRollsDependencies;
}) {
  const { useUserId, fetchResponse, api } = dependencies;
  const {
    copySavedRoll,
    createSavedRoll,
    deleteSavedRoll,
    deleteSavedRollBatch,
    listSavedRollLibraries,
    listSavedRolls,
    reorderSavedRolls,
    searchSavedRolls,
    updateSavedRoll,
  } = api;
  const userId = useUserId();
  const queryClient = useQueryClient();
  const [scope, setScope] = React.useState<SavedRollScope>({ type: "personal" });
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [searchOffset, setSearchOffset] = React.useState(0);
  const [searchSort, setSearchSort] = React.useState<{
    column: SavedRollSearchSort;
    direction: "asc" | "desc";
  }>({ column: "name", direction: "asc" });
  const [editing, setEditing] = React.useState<SavedRoll | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState(emptyDraft);
  const [message, setMessage] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copyGuildId, setCopyGuildId] = React.useState("");
  const [copyRename, setCopyRename] = React.useState<{
    target: SavedRollScope;
    draft: SavedRollDraft;
  } | null>(null);

  const mutualGuildQuery = useQuery<Guild[]>({
    queryKey: ["guilds"],
    enabled: userId !== undefined,
    staleTime: 5 * 60 * 1_000,
    queryFn: async () => {
      const response = await fetchResponse("/api/guilds/mutual");
      if (!response.ok) throw new Error("Guild lookup failed");
      const value = z.object({
        guilds: z.array(z.object({
          guilds: z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().nullable(),
          }),
          isAdmin: z.boolean(),
          isDiceWitchAdmin: z.boolean(),
        })),
      }).safeParse(await response.json());
      return value.success
        ? value.data.guilds.map((guild) => ({
            ...guild,
            guilds: { ...guild.guilds, icon: guild.guilds.icon ?? "" },
          }))
        : [];
    },
  });
  const adminGuilds = (mutualGuildQuery.data ?? []).filter(
    (guild) => guild.isAdmin || guild.isDiceWitchAdmin,
  );
  const libraryQuery = useQuery({
    queryKey: ["saved-roll-libraries"],
    queryFn: listSavedRollLibraries,
    staleTime: 5 * 60 * 1_000,
  });
  const libraryGuilds = React.useMemo<Guild[]>(
    () =>
      (libraryQuery.data ?? [])
        .filter((library) => library.isAdmin || library.isDiceWitchAdmin)
        .map((library) => ({
          guilds: {
            id: library.guildId,
            name: library.guildName,
            icon: library.guildIcon ?? "",
          },
          isAdmin: library.isAdmin,
          isDiceWitchAdmin: library.isDiceWitchAdmin,
        })),
    [libraryQuery.data],
  );
  const selectedLibrary = libraryQuery.data?.find(
    (library) => scope.type === "guild" && library.guildId === scope.guildId,
  );
  const canManageScope =
    scope.type === "personal" ||
    selectedLibrary?.isAdmin === true ||
    selectedLibrary?.isDiceWitchAdmin === true;

  React.useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setDebouncedSearch("");
      return;
    }
    const timeout = window.setTimeout(() => setDebouncedSearch(query), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  React.useEffect(() => {
    setSearchOffset(0);
  }, [debouncedSearch, searchSort]);

  React.useEffect(() => {
    setSelectedIds(new Set());
    setCopyOpen(false);
  }, [debouncedSearch, scope, searchOffset]);

  React.useEffect(() => {
    if (
      scope.type === "guild" &&
      libraryQuery.data !== undefined &&
      !libraryGuilds.some(({ guilds }) => guilds.id === scope.guildId)
    ) {
      setScope({ type: "personal" });
      setEditing(null);
      setCreating(false);
    }
  }, [libraryGuilds, libraryQuery.data, scope]);

  React.useEffect(() => {
    if (
      copyGuildId !== "" &&
      !adminGuilds.some(({ guilds }) => guilds.id === copyGuildId)
    ) {
      setCopyGuildId("");
    } else if (copyGuildId === "" && adminGuilds[0] !== undefined) {
      setCopyGuildId(adminGuilds[0].guilds.id);
    }
  }, [adminGuilds, copyGuildId]);

  const listQuery = useQuery({
    queryKey: savedRollQueryKey(scope),
    queryFn: () => listSavedRolls(scope),
  });
  const list = listQuery.data;
  const searchMode = debouncedSearch.length >= 2;
  const searchQuery = useQuery({
    queryKey: [
      "saved-roll-search",
      debouncedSearch,
      searchOffset,
      searchSort.column,
      searchSort.direction,
    ],
    queryFn: () =>
      searchSavedRolls({
        query: debouncedSearch,
        offset: searchOffset,
        sort: searchSort.column,
        direction: searchSort.direction,
      }),
    enabled: searchMode,
  });

  const runMutation = useMutation({
    mutationFn: (operation: () => Promise<SavedRollMutation>) => operation(),
    onSuccess: async (result) => {
      const resultMessage = mutationMessage(result);
      setMessage(resultMessage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["saved-rolls"] }),
        queryClient.invalidateQueries({ queryKey: ["saved-roll-libraries"] }),
        queryClient.invalidateQueries({ queryKey: ["saved-roll-search"] }),
      ]);
      if (resultMessage === null) {
        setCreating(false);
        setEditing(null);
        setCopyOpen(false);
        setSelectedIds(new Set());
      }
    },
    onError: async (error: Error) => {
      setMessage(errorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ["saved-rolls"] });
    },
  });

  const submitDraft = (draft: SavedRollDraft) => {
    if (list === undefined || !canManageScope) return;
    if (editing === null) {
      runMutation.mutate(() =>
        createSavedRoll(scope, {
          draft,
          expectedListRevision: list.listRevision,
        }),
      );
      return;
    }
    const currentRecord = list.savedRolls.find(({ id }) => id === editing.id);
    if (currentRecord === undefined) {
      setMessage("This library roll no longer exists.");
      return;
    }
    runMutation.mutate(() =>
      updateSavedRoll(scope, currentRecord, {
        draft,
        expectedListRevision: list.listRevision,
      }),
    );
  };

  const setScopeValue = (value: string) => {
    setEditing(null);
    setCreating(false);
    setCreateDraft(emptyDraft);
    setMessage(null);
    if (value === "personal") {
      setScope({ type: "personal" });
      return;
    }
    const library = libraryQuery.data?.find(({ guildId }) => guildId === value);
    if (library !== undefined) {
      setScope({
        type: "guild",
        guildId: library.guildId,
        guildName: library.guildName,
      });
    }
  };

  const copyRow = async (row: SavedRollGridRow) => {
    const source = scopeForRow(row);
    let target: SavedRollScope;
    if (source.type === "guild") {
      target = { type: "personal" };
    } else {
      const guild = adminGuilds.find(
        ({ guilds }) => guilds.id === copyGuildId,
      );
      if (guild === undefined) throw new Error("Choose a Server library");
      target = {
        type: "guild",
        guildId: guild.guilds.id,
        guildName: guild.guilds.name,
      };
    }
    const targetList = await queryClient.fetchQuery({
      queryKey: savedRollQueryKey(target),
      queryFn: () => listSavedRolls(target),
    });
    const draft = savedRollDraft(row.savedRoll);
    const result = await copySavedRoll(target, {
      draft,
      expectedListRevision: targetList.listRevision,
    });
    if (result.status === "name_conflict") {
      setCopyRename({
        target,
        draft: {
          ...draft,
          name: copyConflictName(draft.name, source, target),
        },
      });
    }
    return result;
  };

  const selectedRows = React.useMemo<SavedRollGridRow[]>(
    () =>
      (list?.savedRolls ?? []).map((savedRoll) => ({
        savedRoll,
        listRevision: list?.listRevision ?? 0,
        source:
          scope.type === "personal"
            ? { type: "personal" as const }
            : {
                type: "guild" as const,
                guildId: scope.guildId,
                guildName: scope.guildName,
                guildIcon: selectedLibrary?.guildIcon ?? null,
              },
        canManage: canManageScope,
      })),
    [canManageScope, list, scope, selectedLibrary?.guildIcon],
  );
  const rows = searchMode ? searchQuery.data?.entries ?? [] : selectedRows;
  const selectedGridRows = rows.filter(({ savedRoll }) =>
    selectedIds.has(savedRoll.id),
  );
  const selectedRow = selectedGridRows.length === 1
    ? selectedGridRows[0] ?? null
    : null;
  const selectedRowCanCopy =
    selectedRow !== null &&
    (selectedRow.source.type === "guild" || adminGuilds.length > 0);
  const batchDeleteScope = (() => {
    const first = selectedGridRows[0];
    if (first === undefined || !first.canManage) return null;
    const target = scopeForRow(first);
    return selectedGridRows.every(
      (row) =>
        row.canManage &&
        row.listRevision === first.listRevision &&
        scopeKey(scopeForRow(row)) === scopeKey(target),
    )
      ? target
      : null;
  })();
  const usedColors = (list?.savedRolls ?? []).flatMap(({ id, nameColor }) =>
    id === editing?.id || nameColor === null ? [] : [nameColor],
  );
  const loading = searchMode ? searchQuery.isLoading : listQuery.isLoading;
  const failed = searchMode ? searchQuery.isError : listQuery.isError;
  const failure = searchMode ? searchQuery.error : listQuery.error;
  let gridKey = "personal";
  if (searchMode) gridKey = "search";
  else if (scope.type === "guild") gridKey = scope.guildId;

  return (
    <TooltipProvider>
      <Dialog
        open={copyRename !== null}
        onOpenChange={(open) => {
          if (!open) setCopyRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename copied library roll</DialogTitle>
            <DialogDescription>
              That name already exists in the destination library. Choose a new
              name; the copied roll remains independent.
            </DialogDescription>
          </DialogHeader>
          {copyRename !== null && (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                runMutation.mutate(async () => {
                  const targetList = await listSavedRolls(copyRename.target);
                  const result = await copySavedRoll(copyRename.target, {
                    draft: copyRename.draft,
                    expectedListRevision: targetList.listRevision,
                  });
                  if (
                    result.status === "applied" ||
                    result.status === "existing"
                  ) {
                    setCopyRename(null);
                  }
                  return result;
                });
              }}
            >
              <Label htmlFor="copy-saved-roll-name">New name</Label>
              <Input
                id="copy-saved-roll-name"
                autoFocus
                required
                value={copyRename.draft.name}
                onChange={(event) =>
                  setCopyRename({
                    ...copyRename,
                    draft: {
                      ...copyRename.draft,
                      name: event.target.value,
                    },
                  })
                }
              />
              <Button type="submit" disabled={runMutation.isPending}>
                {runMutation.isPending ? "Copying…" : "Copy with new name"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DraggableLibraryDialog
          title={
            editing === null
              ? "New library roll"
              : `Edit ${editing.displayName}`
          }
        >
          <DraftEditor
            key={editing?.id ?? "create"}
            initial={editing === null ? createDraft : savedRollDraft(editing)}
            submitting={runMutation.isPending}
            usedColors={usedColors}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSubmit={submitDraft}
          />
        </DraggableLibraryDialog>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy to…</DialogTitle>
            <DialogDescription>
              Copy {selectedRow?.savedRoll.displayName ?? "the selected roll"} into another library.
            </DialogDescription>
          </DialogHeader>
          {selectedRow !== null && (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                runMutation.mutate(() => copyRow(selectedRow));
              }}
            >
              {selectedRow.source.type === "personal" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="copy-server-target">Destination</Label>
                  <SavedRollLibrarySelect
                    id="copy-server-target"
                    ariaLabel="Copy destination"
                    guilds={adminGuilds}
                    includePersonal={false}
                    value={copyGuildId}
                    onValueChange={setCopyGuildId}
                    disabled={runMutation.isPending}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Destination: personal library
                </p>
              )}
              <Button
                type="submit"
                variant="brand"
                disabled={runMutation.isPending}
              >
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                {runMutation.isPending ? "Copying…" : "Copy"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <aside className="grid min-w-0 max-w-full self-start content-start gap-4 overflow-hidden rounded-lg border bg-card p-4">
            {canManageScope && !searchMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    disabled={runMutation.isPending || creating}
                    onClick={() => {
                      setEditing(null);
                      setCreateDraft(emptyDraft);
                      setCreating(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Save a roll for quick access in Discord and the web roller.
                </TooltipContent>
              </Tooltip>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="saved-roll-search">Search</Label>
              <Input
                id="saved-roll-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, notation, title, or server"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchMode
                ? `${String(searchQuery.data?.total ?? 0)} results`
                : list === undefined
                  ? ""
                  : `${String(list.savedRolls.length)} / ${scope.type === "personal" ? "50" : "100"}`}
            </p>
          </aside>

          <section
            className="grid min-w-0 content-start gap-4"
            aria-label="Library"
          >
            <div className="sticky top-0 z-20 flex min-w-0 flex-wrap items-end gap-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur sm:static sm:bg-card">
              <div className="min-w-0 flex-1">
                {libraryQuery.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Server libraries are temporarily unavailable.
                  </p>
                ) : libraryGuilds.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <SavedRollLibrarySelect
                          ariaLabel="Library"
                          guilds={libraryGuilds}
                          includePersonal
                          value={
                            scope.type === "personal" ? "personal" : scope.guildId
                          }
                          onValueChange={setScopeValue}
                          disabled={runMutation.isPending}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Switch between your personal library and a server library.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <p className="py-2 text-sm font-semibold">Personal library</p>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="brand"
                      disabled={!selectedRowCanCopy || runMutation.isPending}
                      onClick={() => setCopyOpen(true)}
                    >
                      <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                      Copy to…
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Copy the selected roll between your personal and server libraries.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        batchDeleteScope === null || runMutation.isPending
                      }
                      onClick={() => {
                        const first = selectedGridRows[0];
                        if (batchDeleteScope === null || first === undefined) return;
                        const count = selectedGridRows.length;
                        if (!window.confirm(
                          `Delete ${String(count)} ${count === 1 ? "roll" : "rolls"}?`,
                        )) return;
                        runMutation.mutate(() =>
                          deleteSavedRollBatch(
                            batchDeleteScope,
                            selectedGridRows.map(({ savedRoll }) => savedRoll),
                            first.listRevision,
                          ),
                        );
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Delete the selected rolls from one library.
                </TooltipContent>
              </Tooltip>
            </div>
            {message !== null && (
              <div role="status" className="rounded-md border px-3 py-2 text-sm">
                {message}
              </div>
            )}
            {loading && (
              <SparkleLoadingIndicator
                label="Loading library"
                className="min-h-48"
              />
            )}
            {failed && (
              <div role="alert" className="rounded-md border border-destructive p-4">
                {errorMessage(failure)}
              </div>
            )}
            {!loading && !failed && rows.length === 0 && searchMode && (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                No library rolls match this search.
              </div>
            )}
            {!loading && !failed && rows.length > 0 && (
              <SavedRollGrid
                key={gridKey}
                rows={rows}
                searchMode={searchMode}
                searchSort={searchSort}
                canReorder={!searchMode && canManageScope}
                pending={runMutation.isPending}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onSearchSortChange={setSearchSort}
                onEdit={(row) => {
                  setScope(scopeForRow(row));
                  setSearch("");
                  setDebouncedSearch("");
                  setCreating(false);
                  setEditing(row.savedRoll);
                }}
                onDelete={(row) => {
                  if (
                    !window.confirm(`Delete ${row.savedRoll.displayName}?`)
                  ) {
                    return;
                  }
                  runMutation.mutate(() =>
                    deleteSavedRoll(
                      scopeForRow(row),
                      row.savedRoll,
                      row.listRevision,
                    ),
                  );
                }}
                onReorder={(orderedIds) => {
                  if (list === undefined) return;
                  const records = new Map(
                    list.savedRolls.map((savedRoll) => [savedRoll.id, savedRoll]),
                  );
                  const savedRolls: SavedRoll[] = [];
                  for (const id of orderedIds) {
                    const savedRoll = records.get(id);
                    if (savedRoll === undefined) return;
                    savedRolls.push(savedRoll);
                  }
                  queryClient.setQueryData(savedRollQueryKey(scope), {
                    ...list,
                    savedRolls,
                  });
                  runMutation.mutate(() =>
                    reorderSavedRolls(scope, orderedIds, list.listRevision),
                  );
                }}
              />
            )}
            {searchMode && !loading && !failed && (
              <nav className="flex items-center justify-between gap-3" aria-label="Search pages">
                <Button
                  variant="outline"
                  disabled={searchOffset === 0}
                  onClick={() =>
                    setSearchOffset(Math.max(0, searchOffset - 50))
                  }
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {String(searchOffset / 50 + 1)}
                </span>
                <Button
                  variant="outline"
                  disabled={!searchQuery.data?.hasMore}
                  onClick={() => setSearchOffset(searchOffset + 50)}
                >
                  Next
                </Button>
              </nav>
            )}
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

function useProductionUserId(): string | undefined {
  return useUser().user?.id;
}

const productionSavedRollsDependencies: SavedRollsDependencies = {
  useUserId: useProductionUserId,
  fetchResponse: customFetch,
  api: {
    copySavedRoll,
    createSavedRoll,
    deleteSavedRoll,
    deleteSavedRollBatch,
    listSavedRollLibraries,
    listSavedRolls,
    reorderSavedRolls,
    searchSavedRolls,
    updateSavedRoll,
  },
};

export default function SavedRolls() {
  return <SavedRollsView dependencies={productionSavedRollsDependencies} />;
}
