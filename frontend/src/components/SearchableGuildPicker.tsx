import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import * as React from "react";

export interface SearchableGuild {
  guilds: {
    id: string;
    name: string;
    icon: string | null;
  };
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
}

export function SearchableGuildPicker({
  guilds,
  value,
  onValueChange,
}: {
  guilds: readonly SearchableGuild[];
  value: string;
  onValueChange(value: string): void;
}) {
  const [query, setQuery] = React.useState("");
  const groupName = React.useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGuilds = guilds.filter(({ guilds: guild }) =>
    guild.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Search server names"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search server names"
        autoComplete="off"
        className="block h-11 w-full rounded-md border bg-background px-3 text-sm sm:max-w-md"
      />

      <div
        role="radiogroup"
        aria-label="Authorized servers"
        className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border bg-background p-2 sm:grid-cols-2"
      >
        {visibleGuilds.map((membership) => {
          const guild = membership.guilds;
          const selected = guild.id === value;
          return (
            <label
              key={guild.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors focus-within:ring-2 focus-within:ring-ring ${
                selected
                  ? "border-brand bg-brand/10"
                  : "hover:border-brand/50 hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={guild.id}
                checked={selected}
                onChange={() => onValueChange(guild.id)}
                className="sr-only"
              />
              <Avatar className="h-8 w-8 shrink-0">
                {guild.icon ? (
                  <AvatarImage
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                    alt=""
                  />
                ) : (
                  <AvatarFallback>{guild.name.charAt(0)}</AvatarFallback>
                )}
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {guild.name}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {membership.isAdmin && (
                    <Badge variant="secondary">Administrator</Badge>
                  )}
                  {membership.isDiceWitchAdmin && (
                    <Badge variant="destructive">Dice Witch Admin</Badge>
                  )}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {visibleGuilds.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No authorized servers match that search.
        </p>
      )}
    </div>
  );
}
