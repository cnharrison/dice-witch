import { getAppearanceThumbsVersionV4 } from "@/lib/appearance-v4";
import { useQuery } from "@tanstack/react-query";

// Null until fetched; tiles stay shimmer slots rather than guessing keys.
export function useAppearanceThumbVersion() {
  const query = useQuery({
    queryKey: ["appearanceThumbsVersionV4"],
    queryFn: getAppearanceThumbsVersionV4,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  return query.data ?? null;
}
