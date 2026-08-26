// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customFetch as productionFetch } from '../lib/api';
import { createUseServerStats } from './useServerStats';

const mockedFetch = vi.fn<typeof productionFetch>();
const useServerStats = createUseServerStats(mockedFetch);

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } }
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useServerStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the three distinct audience facts from a V1 snapshot', async () => {
    mockedFetch.mockResolvedValue(
      Response.json({
        version: 1,
        capturedAt: 1_767_225_600_123,
        liveGuilds: 3,
        estimatedGuildMemberships: 120,
        knownDiceWitchUsers: 7,
        shardCount: 2,
        guildCountsByShard: [2, 1]
      })
    );

    const { result } = renderHook(() => useServerStats(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current).toMatchObject({
      liveGuilds: 3,
      estimatedGuildMemberships: 120,
      knownDiceWitchUsers: 7,
      loading: false,
      error: false
    });
  });
});
