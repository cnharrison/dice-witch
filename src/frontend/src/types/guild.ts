export interface Guild {
  guilds: {
    id: string;
    name: string;
    icon: string;
  };
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
}