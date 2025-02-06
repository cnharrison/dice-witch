import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Guild } from "@/types/guild";

interface GuildDropdownProps {
  guilds?: Guild[];
}

export function GuildDropdown({ guilds = [] }: GuildDropdownProps) {
  const adminGuilds = guilds.filter(guild => guild.isAdmin || guild.isDiceWitchAdmin);

  return (
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select Guild" />
      </SelectTrigger>
      <SelectContent>
        {adminGuilds.map((guild) => (
          <SelectItem key={guild.guilds.id} value={guild.guilds.id}>
            <div className="flex items-center justify-between">
              <span>{guild.guilds.name}</span>
              <div className="flex ml-4">
                {guild.isAdmin && (
                  <Badge variant="secondary">Admin</Badge>
                )}
                {guild.isDiceWitchAdmin && (
                  <Badge variant="destructive">DW Admin</Badge>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}