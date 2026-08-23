export interface Guild {
  guilds: {
    id: string;
    name: string;
    icon: string | null;
  };
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
}

export type RollerGuild = Guild & { isRollable: boolean };

export interface Channel {
  id: string;
  name: string;
  type: 0 | 5;
}
