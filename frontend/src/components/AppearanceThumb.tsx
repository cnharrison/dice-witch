import { appearanceThumbUrl, type AppearanceThumbKind } from "@/lib/appearance-thumbs";
import { appConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import * as React from "react";

type AppearanceThumbProps = {
  kind: AppearanceThumbKind;
  id: string;
  catalogVersion: number;
  rendererRevision: string;
  cacheRevision: number;
  alt: string;
  className?: string;
  imageClassName?: string;
};

// Baked catalog tiles load lazily; picking never waits on them — the slot
// stays tappable behind the shimmer until the PNG arrives.
export function AppearanceThumb({
  kind,
  id,
  catalogVersion,
  rendererRevision,
  cacheRevision,
  alt,
  className,
  imageClassName,
}: AppearanceThumbProps) {
  const [loaded, setLoaded] = React.useState(false);
  const url = appearanceThumbUrl(
    appConfig.apiBase,
    { catalogVersion, rendererRevision, cacheRevision },
    kind,
    id,
  );
  return (
    <span
      className={cn(
        "relative inline-grid place-items-center overflow-hidden rounded-md",
        className,
      )}
    >
      {!loaded && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse rounded-md border border-dashed border-brand/40 bg-muted/40"
        />
      )}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        className={cn(
          "h-full w-full object-contain",
          imageClassName,
          !loaded && "invisible",
        )}
      />
    </span>
  );
}
