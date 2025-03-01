import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

interface ServerStatsResponse {
  servers: number;
  users: number;
}

interface ServerStats {
  servers: number;
  users: number;
  loading: boolean;
  error: boolean;
  available: boolean;
}

const STATS_STORAGE_KEY = 'dice-witch-server-stats';

const getStoredStats = (): ServerStatsResponse | null => {
  try {
    const storedData = localStorage.getItem(STATS_STORAGE_KEY);
    if (storedData) {
      const { data, timestamp } = JSON.parse(storedData);
      if (timestamp && Date.now() - timestamp < 1000 * 60 * 60 * 24) {
        return data;
      }
    }
  } catch (error) {
    console.warn('Error reading stats from localStorage:', error);
  }
  return null;
};

const storeStats = (data: ServerStatsResponse): void => {
  try {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        data,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.warn('Error storing stats in localStorage:', error);
  }
};

const fetchServerStats = async (): Promise<ServerStatsResponse> => {
  try {
    const response = await fetch('/api/stats/public');
    
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }
    
    const data = await response.json();
    
    if (data.servers <= 0 || data.users <= 0) {
      throw new Error('Invalid stats received');
    }
    
    storeStats(data);
    return data;
  } catch (error) {
    const storedStats = getStoredStats();
    if (storedStats && storedStats.servers > 0 && storedStats.users > 0) {
      return storedStats;
    }
    
    throw error;
  }
};

export function useServerStats(): ServerStats {
  const initialData = React.useMemo(() => getStoredStats(), []);
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['serverStats'],
    queryFn: fetchServerStats,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    initialData: initialData && initialData.servers > 0 && initialData.users > 0 ? initialData : undefined
  });

  const loading = isLoading && !data;
  const available = !isError && !!data && data.servers > 0 && data.users > 0;

  return {
    servers: data?.servers ?? 0,
    users: data?.users ?? 0,
    loading,
    error: isError,
    available
  };
}