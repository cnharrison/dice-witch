import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Channel {
  id: string;
  name: string;
  type: number;
}

interface ChannelDropdownProps {
  channels?: Channel[];
  value?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function ChannelDropdown({
  channels = [],
  value,
  onValueChange,
  ariaLabel,
  triggerClassName,
  contentClassName,
}: ChannelDropdownProps) {
  const selectedChannel = channels.find((channel) => channel.id === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn("w-[300px]", triggerClassName)}
        aria-label={ariaLabel}
      >
        <div className="flex w-full items-center">
          {selectedChannel ? (
            <span className="truncate">#{selectedChannel.name}</span>
          ) : (
            <span className="text-muted-foreground">Select channel</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className={cn("min-w-[300px]", contentClassName)}>
        {channels.map((channel) => (
          <SelectItem key={channel.id} value={channel.id} className="py-2">
            <span>#{channel.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
