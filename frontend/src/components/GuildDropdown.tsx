import React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Guild } from "@/types/guild";

interface GuildDropdownProps {
  guilds?: Guild[];
}

export function GuildDropdown({ guilds = [] }: GuildDropdownProps) {
  const adminGuilds = guilds.filter(guild => guild.isAdmin || guild.isDiceWitchAdmin);

  console.log(adminGuilds);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Select Guild
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {adminGuilds.map((guild) => (
          <DropdownMenuItem key={guild.guilds.id} className="flex items-center justify-between">
            <span>{guild.guilds.name}</span>
            <div className="flex ml-4">
              {guild.isAdmin && (
                <Badge variant="secondary">Admin</Badge>
              )}
              {guild.isDiceWitchAdmin && (
                <Badge variant="destructive">DW Admin</Badge>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}