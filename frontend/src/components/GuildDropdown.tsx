import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Guild } from "@/types/guild";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface GuildDropdownProps {
  guilds?: Guild[];
  value?: string;
  onValueChange?: (value: string) => void;
}

export function GuildDropdown({ guilds = [], value, onValueChange }: GuildDropdownProps) {
  const adminGuilds = guilds.filter(guild => guild.isAdmin || guild.isDiceWitchAdmin);
  const selectedGuild = adminGuilds.find(guild => guild.guilds.id === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[300px]">
        <div className="flex items-center w-full">
          {selectedGuild ? (
            <>
              <Avatar className="h-6 w-6 shrink-0 mr-2">
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
            <span className="text-muted-foreground">Select Guild</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className="min-w-[300px]">
        {adminGuilds.map((guild) => (
          <SelectItem key={guild.guilds.id} value={guild.guilds.id} className="py-2">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  {guild.guilds.icon ? (
                    <AvatarImage 
                      src={`https://cdn.discordapp.com/icons/${guild.guilds.id}/${guild.guilds.icon}.png`} 
                      alt={guild.guilds.name} 
                    />
                  ) : (
                    <AvatarFallback>
                      {guild.guilds.name.charAt(0)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="truncate max-w-[100px]">{guild.guilds.name}</span>
              </div>
              <div className="flex ml-2 flex-shrink-0">
                {guild.isAdmin && (
                  <Badge variant="secondary" className="ml-1">Admin</Badge>
                )}
                {guild.isDiceWitchAdmin && (
                  <Badge variant="destructive" className="ml-1">DW Admin</Badge>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}