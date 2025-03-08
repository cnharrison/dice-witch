import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useGuild } from '@/context/GuildContext';
import { customFetch } from '../../main';
import { GuildDropdown } from '@/components/GuildDropdown';

interface Guild {
  guilds: {
    id: string;
    name: string;
    icon: string | null;
  };
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
}


export default function Preferences() {
  const {
    selectedGuildId,
    setSelectedGuildId
  } = useGuild();

  const queryClient = useQueryClient();

  const { data: guildsData, isLoading: isGuildsLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: async () => {
      try {
        const response = await customFetch('/api/guilds/mutual');

        if (!response.ok) {
          throw new Error('Failed to fetch guilds');
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching guilds:', error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 3,
    refetchOnMount: "always"
  });

  const { data: preferencesData, isLoading: isPreferencesLoading } = useQuery({
    queryKey: ['guildPreferences', selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId || selectedGuildId === '') {
        return null;
      }

      try {
        const response = await customFetch(`/api/guilds/${selectedGuildId}/preferences`);

        if (!response.ok) {
          throw new Error('Failed to fetch guild preferences');
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching guild preferences:', error);
        throw error;
      }
    },
    enabled: !!selectedGuildId && selectedGuildId !== '',
    staleTime: 1000 * 60 * 5,
    cacheTime: 1000 * 60 * 30,
    retry: 2
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { skipDiceDelay: boolean }) => {
      const response = await customFetch(`/api/guilds/${selectedGuildId}/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      return response.json();
    },
    onMutate: async (newPreferences) => {
      await queryClient.cancelQueries({
        queryKey: ['guildPreferences', selectedGuildId]
      });

      const previousPreferences = queryClient.getQueryData(['guildPreferences', selectedGuildId]);

      queryClient.setQueryData(['guildPreferences', selectedGuildId], {
        preferences: newPreferences
      });

      return { previousPreferences };
    },
    onError: (err, newPreferences, context) => {
      queryClient.setQueryData(
        ['guildPreferences', selectedGuildId],
        context?.previousPreferences
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['guildPreferences', selectedGuildId] });
    }
  });

  const handleGuildChange = (newGuildId: string) => {
    setSelectedGuildId(newGuildId);
  };

  const handleToggleChange = (checked: boolean) => {
    updatePreferencesMutation.mutate({ skipDiceDelay: checked });
  };

  const preferences = preferencesData?.preferences;

  const guilds = Array.isArray(guildsData?.guilds) ? guildsData.guilds : [];

  const adminGuilds = guilds.filter(
    (guild: Guild) => guild.isAdmin || guild.isDiceWitchAdmin
  );

  const selectedGuildHasAdmin = selectedGuildId ? adminGuilds.some(
    guild => guild.guilds.id === selectedGuildId
  ) : false;

  return (
    <div className="container mx-auto py-6">
      <div className="relative w-full flex justify-center mb-10">
        <h1 className="font-['UnifrakturMaguntia'] text-[#ff00ff] text-6xl font-bold tracking-wide [text-shadow:3px_3px_6px_rgba(0,0,0,0.75)] dark:[text-shadow:3px_3px_6px_rgba(0,0,0,0.95)]">
          Guild Preferences
        </h1>
      </div>

      {isGuildsLoading ? (
        <div className="flex items-center justify-center py-4 mb-6">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#ff00ff]"></div>
          <span className="ml-3">Loading guilds...</span>
        </div>
      ) : (
        <>
          <div className="mb-6 flex justify-center">
            {Array.isArray(guilds) && guilds.length > 0 ? (
              <div className="w-[300px]">
                <GuildDropdown
                  guilds={guilds}
                  value={selectedGuildId || ""}
                  onValueChange={handleGuildChange}
                />
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">You don't have any mutual guilds with Dice Witch.</p>
                    <a
                      href={`https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID || '808161585876697108'}&permissions=0&scope=bot%20applications.commands`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded"
                    >
                      Add Dice Witch to a server
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedGuildId && !selectedGuildHasAdmin && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-500 p-4 rounded max-w-2xl mx-auto">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <span className="font-medium">No admin access:</span> You need admin permissions or the Dice Witch Admin role to manage settings for this server.
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    If you're a server admin, try rolling dice in that server first, then come back here.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedGuildId && selectedGuildHasAdmin && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-amber-100 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold mb-4">Dice Roll Settings</h2>

          {isPreferencesLoading ? (
            <p>Loading preferences...</p>
          ) : (
            <div className="flex items-center space-x-2">
              <Switch
                id="skipDiceDelay"
                checked={preferences?.skipDiceDelay || false}
                onCheckedChange={handleToggleChange}
              />
              <Label htmlFor="skipDiceDelay">
                Skip dice roll delay and message
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
