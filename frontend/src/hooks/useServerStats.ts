import { useQuery } from '@tanstack/react-query';
import { customFetch } from '../lib/api';

interface ServerStatsResponse {
  version: 1;
  capturedAt: number;
  liveGuilds: number;
  estimatedGuildMemberships: number;
  knownDiceWitchUsers: number;
}

interface ServerStats {
  liveGuilds: number;
  estimatedGuildMemberships: number;
  knownDiceWitchUsers: number;
  loading: boolean;
  error: boolean;
  available: boolean;
}

async function fetchServerStats(
  fetchResponse: typeof customFetch,
): Promise<ServerStatsResponse> {
  const response = await fetchResponse('/api/stats/public');
  if (!response.ok) throw new Error('Failed to fetch stats');

  const z = await import("zod");
  const nonNegativeIntegerSchema = z.number().int().nonnegative();
  const data = z.object({
    version: z.literal(1),
    capturedAt: nonNegativeIntegerSchema,
    liveGuilds: nonNegativeIntegerSchema,
    estimatedGuildMemberships: nonNegativeIntegerSchema,
    knownDiceWitchUsers: nonNegativeIntegerSchema,
  }).safeParse(await response.json());
  if (!data.success) throw new Error('Invalid stats received');
  return data.data;
}

export function createUseServerStats(fetchResponse: typeof customFetch) {
  return function useServerStats(): ServerStats {
    const { data, isLoading, isError } = useQuery({
      queryKey: ['serverStats'],
      queryFn: () => fetchServerStats(fetchResponse),
      staleTime: 1000 * 60 * 60,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnMount: false
    });

    return {
      liveGuilds: data?.liveGuilds ?? 0,
      estimatedGuildMemberships: data?.estimatedGuildMemberships ?? 0,
      knownDiceWitchUsers: data?.knownDiceWitchUsers ?? 0,
      loading: isLoading,
      error: isError,
      available: data !== undefined && !isError
    };
  };
}

export const useServerStats = createUseServerStats(customFetch);
