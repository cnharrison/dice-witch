import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AppearanceSelectV3Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  containerClassName?: string;
};

export function AppearanceSelectV3({
  children,
  className,
  containerClassName,
  ...props
}: AppearanceSelectV3Props) {
  return (
    <span className={cn("relative block min-w-0", containerClassName)}>
      <select
        {...props}
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-md border bg-background py-0 pl-3 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          props.disabled && "opacity-50",
        )}
      />
    </span>
  );
}
