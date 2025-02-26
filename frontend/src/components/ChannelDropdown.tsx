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
  onValueChange?: (value: string) => void;
}

export function ChannelDropdown({ channels = [], onValueChange }: ChannelDropdownProps) {
  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select Channel" />
      </SelectTrigger>
      <SelectContent>
        {channels.map((channel) => (
          <SelectItem key={channel.id} value={channel.id}>
            <span>#{channel.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
