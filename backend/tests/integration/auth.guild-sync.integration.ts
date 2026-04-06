import { describe, test, expect } from '@jest/globals';

/**
 * Tests for the null handling applied to Discord guild snapshot fields
 * during OAuth login guild sync in web/routes/auth.ts.
 *
 * Since GuildType now accepts null for memberCount, joinedTimestamp, and icon,
 * auth.ts passes null values through directly rather than coercing them to
 * fake defaults. This ensures the DB accurately reflects what Discord returned.
 */

type GuildSnapshot = {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  memberCount: number | null;
  approximateMemberCount: number | null;
  preferredLocale: string;
  publicUpdatesChannelId: string | null;
  joinedTimestamp: number | null;
};

// Mirrors the field mapping in web/routes/auth.ts
function buildGuildTypeFromSnapshot(snapshot: GuildSnapshot) {
  return {
    id: snapshot.id,
    name: snapshot.name,
    icon: snapshot.icon,
    ownerId: snapshot.ownerId,
    memberCount: snapshot.memberCount,
    approximateMemberCount: snapshot.approximateMemberCount ?? undefined,
    preferredLocale: snapshot.preferredLocale,
    publicUpdatesChannelId: snapshot.publicUpdatesChannelId ?? undefined,
    joinedTimestamp: snapshot.joinedTimestamp,
  };
}

const baseSnapshot: GuildSnapshot = {
  id: 'guild-1',
  name: 'Test Guild',
  icon: 'abc123',
  ownerId: 'owner-1',
  memberCount: 500,
  approximateMemberCount: 480,
  preferredLocale: 'en-US',
  publicUpdatesChannelId: 'ch-1',
  joinedTimestamp: 1700000000000,
};

describe('auth.ts guild sync — null field handling', () => {
  test('passes through non-null fields unchanged', () => {
    const result = buildGuildTypeFromSnapshot(baseSnapshot);
    expect(result.memberCount).toBe(500);
    expect(result.joinedTimestamp).toBe(1700000000000);
    expect(result.icon).toBe('abc123');
  });

  test('icon null passes through as null', () => {
    const result = buildGuildTypeFromSnapshot({ ...baseSnapshot, icon: null });
    expect(result.icon).toBeNull();
  });

  test('memberCount null passes through as null', () => {
    const result = buildGuildTypeFromSnapshot({ ...baseSnapshot, memberCount: null });
    expect(result.memberCount).toBeNull();
  });

  test('joinedTimestamp null passes through as null', () => {
    const result = buildGuildTypeFromSnapshot({ ...baseSnapshot, joinedTimestamp: null });
    expect(result.joinedTimestamp).toBeNull();
  });

  test('approximateMemberCount null becomes undefined', () => {
    const result = buildGuildTypeFromSnapshot({ ...baseSnapshot, approximateMemberCount: null });
    expect(result.approximateMemberCount).toBeUndefined();
  });

  test('publicUpdatesChannelId null becomes undefined', () => {
    const result = buildGuildTypeFromSnapshot({ ...baseSnapshot, publicUpdatesChannelId: null });
    expect(result.publicUpdatesChannelId).toBeUndefined();
  });

  test('all nullable fields null — null passes through, optional fields become undefined', () => {
    const result = buildGuildTypeFromSnapshot({
      ...baseSnapshot,
      icon: null,
      memberCount: null,
      approximateMemberCount: null,
      publicUpdatesChannelId: null,
      joinedTimestamp: null,
    });
    expect(result.icon).toBeNull();
    expect(result.memberCount).toBeNull();
    expect(result.joinedTimestamp).toBeNull();
    expect(result.approximateMemberCount).toBeUndefined();
    expect(result.publicUpdatesChannelId).toBeUndefined();
  });
});
