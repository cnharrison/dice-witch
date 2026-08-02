import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LibraryRollColorPicker } from "@/components/LibraryRollColorPicker";
import { SavedRollLibrarySelect } from "@/components/SavedRollLibrarySelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSavedRoll,
  listSavedRolls,
  savedRollQueryKey,
  SavedRollApiError,
  type SavedRollScope,
} from "@/lib/saved-rolls";
import type { Guild } from "@/types/guild";

export function SaveLibraryRollDialog({
  open,
  onOpenChange,
  composition,
  manageableGuilds,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composition: Readonly<{
    notation: string;
    title: string;
    repetitions: number;
  }>;
  manageableGuilds: readonly Guild[];
}>) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [nameColor, setNameColor] = React.useState<string | null>(null);
  const [destination, setDestination] = React.useState("personal");
  const [message, setMessage] = React.useState<string | null>(null);
  const destinationGuild = manageableGuilds.find(
    ({ guilds }) => guilds.id === destination,
  );
  let scope: SavedRollScope | null = null;
  if (destination === "personal") {
    scope = { type: "personal" };
  } else if (destinationGuild !== undefined) {
    scope = {
      type: "guild",
      guildId: destinationGuild.guilds.id,
      guildName: destinationGuild.guilds.name,
    };
  }
  const listQuery = useQuery({
    queryKey: scope === null ? ["saved-rolls", "invalid"] : savedRollQueryKey(scope),
    queryFn: () => {
      if (scope === null) throw new Error("Choose an available library");
      return listSavedRolls(scope);
    },
    enabled: open && scope !== null,
  });

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setNameColor(null);
    setDestination("personal");
    setMessage(null);
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      if (scope === null) throw new Error("Choose an available library");
      if (listQuery.data === undefined) throw new Error("The library is still loading");
      return createSavedRoll(scope, {
        expectedListRevision: listQuery.data.listRevision,
        draft: {
          version: 2,
          name,
          nameColor,
          notation: composition.notation,
          title: composition.title.trim() === "" ? null : composition.title,
          repetitions: composition.repetitions,
        },
      });
    },
    onSuccess: async (result) => {
      if (result.status === "applied" || result.status === "existing") {
        onOpenChange(false);
      } else if (result.status === "name_conflict") {
        setMessage("That name is already used in this library.");
      } else if (result.status === "cap_reached") {
        setMessage(`This library has reached its ${String(result.limit)} roll limit.`);
      } else {
        setMessage("The library changed. Review the roll and try again.");
      }
      await queryClient.invalidateQueries({ queryKey: ["saved-rolls"] });
    },
    onError: (error: unknown) => {
      setMessage(
        error instanceof SavedRollApiError
          ? error.message
          : "The current roll could not be saved.",
      );
    },
  });

  const usedColors = (listQuery.data?.savedRolls ?? []).flatMap(({ nameColor: color }) =>
    color === null ? [] : [color],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="sr-only">Save to library</DialogTitle>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="save-library-name">Name</Label>
            <Input
              id="save-library-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Destination</Label>
            <SavedRollLibrarySelect
              ariaLabel="Save destination"
              guilds={manageableGuilds}
              includePersonal
              value={destination}
              onValueChange={setDestination}
              disabled={save.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Roll name color</Label>
            <LibraryRollColorPicker
              value={nameColor}
              usedColors={usedColors}
              disabled={save.isPending}
              onChange={setNameColor}
            />
          </div>
          <dl className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Roll</dt>
              <dd className="break-all font-mono">{composition.notation}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Title</dt>
              <dd>{composition.title.trim() === "" ? "None" : composition.title}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Repeat</dt>
              <dd>×{String(composition.repetitions)}</dd>
            </div>
          </dl>
          {message !== null && <p role="status" className="text-sm text-destructive">{message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                name.trim() === "" ||
                composition.notation.trim() === "" ||
                listQuery.data === undefined ||
                save.isPending
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
