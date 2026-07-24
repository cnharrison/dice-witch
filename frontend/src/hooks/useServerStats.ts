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

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isServerStatsResponse = (value: unknown): value is ServerStatsResponse => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const stats = value as Record<string, unknown>;
  return (
    stats.version === 1 &&
    isNonNegativeInteger(stats.capturedAt) &&
    isNonNegativeInteger(stats.liveGuilds) &&
    isNonNegativeInteger(stats.estimatedGuildMemberships) &&
    isNonNegativeInteger(stats.knownDiceWitchUsers)
  );
};

const fetchServerStats = async (): Promise<ServerStatsResponse> => {
  const response = await customFetch('/api/stats/public');
  if (!response.ok) throw new Error('Failed to fetch stats');

  const data: unknown = await response.json();
  if (!isServerStatsResponse(data)) throw new Error('Invalid stats received');
  return data;
};

export function useServerStats(): ServerStats {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['serverStats'],
    queryFn: fetchServerStats,
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
}
