import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';

export const Home = () => {
  const { user } = useUser();
  const discordAccount = user?.externalAccounts.find(
    account => account.provider === 'discord'
  );

  const { data: mutualGuilds } = useQuery({
    queryKey: ['mutualGuilds', discordAccount?.providerUserId],
    enabled: !!discordAccount?.providerUserId,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <div>
      <h1>User guild info</h1>
      <pre>{JSON.stringify(mutualGuilds, null, 2)}</pre>
    </div>
  );
};

export default Home;