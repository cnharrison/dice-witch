export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  discordId?: string | null;
}

export interface Session {
  user: User;
  expires: string;
  accessToken?: string;
}
