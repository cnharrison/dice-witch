import * as React from "react";

function currentMatchV4(query: string): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

export function useBrowserMediaQueryV4(query: string): boolean {
  const [matches, setMatches] = React.useState(() => currentMatchV4(query));

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
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
