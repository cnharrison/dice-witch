import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Guild } from "@/types/guild";

export function GuildLibraryLabel({ guild }: { guild: Guild }) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-1 items-center gap-2 overflow-hidden">
      <Avatar className="h-6 w-6 shrink-0">
        {guild.guilds.icon ? (
          <AvatarImage
            src={`https://cdn.discordapp.com/icons/${guild.guilds.id}/${guild.guilds.icon}.png`}
            alt={guild.guilds.name}
          />
        ) : (
          <AvatarFallback>{guild.guilds.name.charAt(0)}</AvatarFallback>
        )}
      </Avatar>
      <span className="min-w-0 flex-1 truncate">{guild.guilds.name}</span>
      <span className="flex shrink-0 gap-1">
        {guild.isAdmin && <Badge variant="secondary">Admin</Badge>}
        {guild.isDiceWitchAdmin && (
          <Badge variant="destructive">DW Admin</Badge>
        )}
      </span>
    </div>
  );
}

export function SavedRollLibrarySelect({
  ariaLabel,
  id,
  guilds,
  includePersonal,
  value,
  onValueChange,
  disabled = false,
}: {
  ariaLabel: string;
  id?: string;
  guilds: readonly Guild[];
  includePersonal: boolean;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedGuild = guilds.find(({ guilds: { id } }) => id === value);
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className="w-full min-w-0 max-w-full overflow-hidden"
        aria-label={ariaLabel}
      >
        {value === "personal" ? (
          <span>Personal</span>
        ) : selectedGuild === undefined ? (
          <span className="text-muted-foreground">Select server</span>
        ) : (
          <GuildLibraryLabel guild={selectedGuild} />
        )}
      </SelectTrigger>
      <SelectContent className="min-w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]">
        {includePersonal && (
          <SelectItem value="personal" textValue="Personal">
            Personal
          </SelectItem>
        )}
        {guilds.map((guild) => (
          <SelectItem
            key={guild.guilds.id}
            value={guild.guilds.id}
            textValue={guild.guilds.name}
            className="py-2"
          >
            <GuildLibraryLabel guild={guild} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
