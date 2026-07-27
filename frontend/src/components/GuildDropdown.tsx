import { GuildLibraryLabel } from "@/components/SavedRollLibrarySelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Guild } from "@/types/guild";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface GuildDropdownProps {
  guilds?: Guild[];
  value?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function GuildDropdown({
  guilds = [],
  value,
  onValueChange,
  ariaLabel,
  triggerClassName,
  contentClassName,
}: GuildDropdownProps) {
  const selectedGuild = guilds.find(
    (guild) => guild.guilds.id === value,
  );

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn("w-[300px]", triggerClassName)}
        aria-label={ariaLabel}
      >
        <div className="flex w-full items-center">
          {selectedGuild ? (
            <>
              <Avatar className="mr-2 h-6 w-6 shrink-0">
                {selectedGuild.guilds.icon ? (
                  <AvatarImage
                    src={`https://cdn.discordapp.com/icons/${selectedGuild.guilds.id}/${selectedGuild.guilds.icon}.png`}
                    alt={selectedGuild.guilds.name}
                  />
                ) : (
                  <AvatarFallback>
                    {selectedGuild.guilds.name.charAt(0)}
                  </AvatarFallback>
                )}
              </Avatar>
              <span className="truncate">{selectedGuild.guilds.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select server</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className={cn("min-w-[300px]", contentClassName)}>
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
