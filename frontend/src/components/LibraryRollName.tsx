import type { CSSProperties, ReactNode } from "react";
import { libraryRollColorVariants } from "@/lib/library-roll-color";
import { cn } from "@/lib/utils";

export function LibraryRollName({
  color,
  className,
  children,
}: Readonly<{
  color: string | null;
  className?: string;
  children: ReactNode;
}>) {
  if (color === null) return <span className={className}>{children}</span>;
  const variants = libraryRollColorVariants(color);
  return (
    <span
      className={cn(
        "text-[var(--library-roll-name-light)] dark:text-[var(--library-roll-name-dark)]",
        className,
      )}
      style={{
        "--library-roll-name-light": variants.light,
        "--library-roll-name-dark": variants.dark,
      } as CSSProperties}
    >
      {children}
    </span>
  );
}
