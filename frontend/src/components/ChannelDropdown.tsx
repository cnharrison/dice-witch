import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface ChannelDropdownProps {
  channels?: any[];
  value?: string;
  onValueChange?: (value: string) => void;
}

export function ChannelDropdown({ channels = [], value, onValueChange }: ChannelDropdownProps) {
  const selectedChannel = channels.find(channel => channel.id === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[300px]">
        <div className="flex items-center w-full">
          {selectedChannel ? (
            <span className="truncate">#{selectedChannel.name}</span>
          ) : (
            <span className="text-muted-foreground">Select Channel</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className="min-w-[300px]">
        {channels.map((channel) => (
          <SelectItem key={channel.id} value={channel.id} className="py-2">
            <span>#{channel.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
