import React, { createContext, useContext, useState, ReactNode } from 'react';

interface GuildContextType {
  selectedGuildId: string | undefined;
  selectedChannelId: string | undefined;
  setSelectedGuildId: (id: string | undefined) => void;
  setSelectedChannelId: (id: string | undefined) => void;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

export function GuildProvider({ children }: { children: ReactNode }) {
  const [selectedGuildId, setSelectedGuildId] = useState<string | undefined>(undefined);
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(undefined);

  return (
    <GuildContext.Provider 
      value={{ 
        selectedGuildId, 
        selectedChannelId, 
        setSelectedGuildId, 
        setSelectedChannelId 
      }}
    >
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild() {
  const context = useContext(GuildContext);
  if (context === undefined) {
    throw new Error('useGuild must be used within a GuildProvider');
  }
  
  return context;
}