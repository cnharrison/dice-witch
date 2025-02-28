import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useGuild } from '@/context/GuildContext';

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
  const { selectedGuildId: contextGuildId, setSelectedGuildId: setContextGuildId } = useGuild();
  const [selectedGuildId, setSelectedGuildId] = useState<string>(contextGuildId || '');
  const queryClient = useQueryClient();

  const { data: guildsData, isLoading: isGuildsLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await fetch('/api/guilds/mutual');
      if (!response.ok) {
        throw new Error('Failed to fetch guilds');
      }
      return response.json();
    }
  });

  const { data: preferencesData, isLoading: isPreferencesLoading } = useQuery({
    queryKey: ['guildPreferences', selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return null;

      const response = await fetch(`/api/guilds/${selectedGuildId}/preferences`);
      if (!response.ok) {
        throw new Error('Failed to fetch guild preferences');
      }
      return response.json();
    },
    enabled: !!selectedGuildId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 30 // 30 minutes
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { skipDiceDelay: boolean }) => {
      const response = await fetch(`/api/guilds/${selectedGuildId}/preferences`, {
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

  useEffect(() => {
    if (guildsData?.guilds?.length && !selectedGuildId) {
      const adminGuilds = guildsData.guilds.filter(
        (guild: Guild) => guild.isAdmin || guild.isDiceWitchAdmin
      );

      if (adminGuilds.length > 0) {
        setSelectedGuildId(adminGuilds[0].guilds.id);
      }
    }
  }, [guildsData, selectedGuildId]);

  const handleGuildChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGuildId = e.target.value;
    setSelectedGuildId(newGuildId);
    setContextGuildId(newGuildId);
  };

  const handleToggleChange = (checked: boolean) => {
    updatePreferencesMutation.mutate({ skipDiceDelay: checked });
  };

  const preferences = preferencesData?.preferences;
  const guilds = guildsData?.guilds?.filter(
    (guild: Guild) => guild.isAdmin || guild.isDiceWitchAdmin
  ) || [];

  return (
    <div className="container mx-auto py-6">
      <div className="relative w-full flex justify-center mb-10">
        <h1 className="font-['UnifrakturMaguntia'] text-[#ff00ff] text-6xl font-bold tracking-wide [text-shadow:3px_3px_6px_rgba(0,0,0,0.75)] dark:[text-shadow:3px_3px_6px_rgba(0,0,0,0.95)]">
          Guild Preferences
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6 border border-amber-100">
        <h2 className="text-xl font-semibold mb-2">Select Guild</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Choose a guild to configure preferences
        </p>

        {isGuildsLoading ? (
          <p>Loading guilds...</p>
        ) : guilds.length === 0 ? (
          <p>No guilds found where you have admin permissions</p>
        ) : (
          <select
            className="w-full p-2 border border-amber-100 rounded-md dark:bg-gray-700 dark:border-amber-100/50 focus:ring-amber-100 focus:border-amber-100"
            value={selectedGuildId}
            onChange={handleGuildChange}
          >
            <option value="" disabled>Select a guild</option>
            {guilds.map((guild: Guild) => (
              <option key={guild.guilds.id} value={guild.guilds.id}>
                {guild.guilds.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedGuildId && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-amber-100">
          <h2 className="text-xl font-semibold mb-2">Dice Roll Settings</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Configure how dice rolls appear in your server
          </p>

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
                Skip dice roll animation and message
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}