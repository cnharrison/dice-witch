import * as React from "react";
import * as z from "zod";

const browserMediaSchema = z.object({ matchMedia: z.function() });

function hasBrowserMediaV4(): boolean {
  return browserMediaSchema.safeParse(globalThis).success;
}

function currentMatchV4(query: string): boolean {
  return hasBrowserMediaV4() ? window.matchMedia(query).matches : false;
}

export function useBrowserMediaQueryV4(query: string): boolean {
  const [matches, setMatches] = React.useState(() => currentMatchV4(query));

  React.useEffect(() => {
    if (!hasBrowserMediaV4()) return;
    const media = window.matchMedia(query);
    const update = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
