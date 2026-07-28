import * as React from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useSignIn } from '@/lib/AuthProvider';
import { Button } from "@/components/ui/button";
import { useServerStats } from '@/hooks/useServerStats';
import { SvgFilters } from '@/components/SvgFilters';
import diceWitchBanner from '@/assets/dice-witch-banner.webp';
import { appConfig } from '@/lib/config';

const MarketingAppearancePreview = React.lazy(
  () => import('@/components/MarketingAppearancePreview'),
);

const DiscordIcon = () => (
  <svg
    width="32"
    height="24"
    viewBox="0 0 24 18"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className="mr-3 !h-6 !w-8"
    aria-hidden="true"
  >
    <path d="M19.958 1.5C18.465.58 16.841.127 15.144 0c-.153.29-.34.68-.463 1.003-1.83-.28-3.646-.28-5.44 0-.122-.322-.319-.71-.463-.995C7.074.122 5.446.576 3.958 1.493c-2.51 3.71-3.19 7.337-2.853 10.914 1.67 1.226 3.292 1.973 4.883 2.464.392-.533.74-1.1 1.043-1.695-.574-.216-1.122-.48-1.643-.79.138-.1.273-.207.405-.317 3.19 1.464 6.651 1.464 9.797 0 .133.11.271.213.405.317-.522.31-1.07.58-1.643.79.303.595.649 1.162 1.044 1.695 1.595-.488 3.217-1.238 4.887-2.464.394-4.144-.667-7.737-2.907-10.917l-.016.004zm-10.03 8.78c-.954 0-1.734-.871-1.734-1.943 0-1.07.759-1.941 1.734-1.941.976 0 1.752.875 1.735 1.941 0 1.072-.76 1.944-1.735 1.944zm6.414 0c-.954 0-1.734-.871-1.734-1.943 0-1.07.76-1.941 1.734-1.941.975 0 1.752.875 1.734 1.941 0 1.072-.759 1.944-1.734 1.944z"/>
  </svg>
);

const LandingPage = () => {
  const { isSignedIn } = useAuth();
  const { signIn, isLoaded } = useSignIn();
  const location = useLocation();
  const {
    liveGuilds,
    estimatedGuildMemberships,
    knownDiceWitchUsers,
    available
  } = useServerStats();
  const previewSectionRef = React.useRef<HTMLElement>(null);
  const [previewActive, setPreviewActive] = React.useState(false);

  React.useEffect(() => {
    const section = previewSectionRef.current;
    if (section === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
        setPreviewActive(true);
        observer.disconnect();
      },
      { rootMargin: '0px' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const handleSignInWithDiscord = () => {
    if (!isLoaded) return;
    
    try {
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      signIn.authenticateWithRedirect({
        strategy: 'oauth_discord',
        ...(returnTo === null ? {} : { returnTo }),
      });
    } catch (error) {
      console.error('Authentication error:', error);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-marketing-background font-mono text-marketing-foreground">
      <SvgFilters />
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="relative w-60 h-60 md:w-80 md:h-80 mx-auto mb-16">
            <div className="aspect-square overflow-hidden rounded-full border border-marketing-border">
              <img
                src={diceWitchBanner}
                alt="Dice Witch"
                width="320"
                height="320"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover"
                style={{
                  filter: 'grayscale(100%)',
                  mixBlendMode: 'normal'
                }}
              />
            </div>

            <div className="absolute top-[-25px] left-[209px] hidden md:block">
              <svg width="240" height="160" viewBox="0 0 240 160">
                <path
                  d="M120,10
                  C175,10 220,35 220,70
                  C220,105 175,130 120,130
                  C90,130 65,122 45,110
                  L5,140
                  L25,90
                  C20,84 15,77 15,70
                  C15,35 65,10 120,10 Z"
                  fill="white"
                  stroke="black"
                  strokeWidth="2"
                />

                <text
                  x="125"
                  y="50"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'Bangers', cursive, sans-serif"
                  fontWeight="bold"
                  fontSize="18"
                  letterSpacing="1"
                >
                  THE DICE
                </text>
                <text
                  x="125"
                  y="70"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'Bangers', cursive, sans-serif"
                  fontWeight="bold"
                  fontSize="18"
                  letterSpacing="1"
                >
                  <tspan fontWeight="900" fontSize="21">CLATTER</tspan> <tspan>ACROSS</tspan>
                </text>
                <text
                  x="125"
                  y="90"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'Bangers', cursive, sans-serif"
                  fontWeight="bold"
                  fontSize="18"
                  letterSpacing="1"
                >
                  THE TABLE...
                </text>
              </svg>
            </div>

          </div>

          <h1 className="font-['UnifrakturMaguntia'] text-brand text-6xl md:text-8xl mb-8">
            Dice Witch
          </h1>

          <p className="mx-auto mb-12 max-w-2xl border-y border-marketing-border py-4 text-xl text-marketing-muted md:text-2xl">
            A dice roller for Discord with <em>panache</em>
          </p>

          <div
            className="flex flex-col items-center gap-4"
            role="group"
            aria-label="Get started"
          >
            <div
              className="flex flex-col justify-center gap-4 md:flex-row"
              role="group"
              aria-label="Discord actions"
            >
              <Button
                asChild
                className="bg-brand text-brand-foreground hover:bg-brand-hover px-8 py-3 rounded-md flex items-center justify-center text-lg font-medium transition-colors border border-brand shadow-[0_0_15px_hsl(var(--brand)/0.45)]"
              >
                <a
                  href={appConfig.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                >
                  <Plus className="mr-3 !h-7 !w-7" aria-hidden="true" />
                  Add Dice Witch to your server
                </a>
              </Button>

              {isSignedIn ? (
                <Button asChild variant="discord" className="px-8 py-3 text-lg">
                  <Link to="/app" className="flex items-center">
                    <DiscordIcon />
                    Launch App
                  </Link>
                </Button>
              ) : (
                <div className="group relative md:w-auto">
                  <Button
                    onClick={handleSignInWithDiscord}
                    disabled={!isLoaded}
                    aria-describedby="login-with-discord-requirement"
                    className={`w-full bg-discord text-discord-foreground hover:bg-discord-hover px-8 py-3 rounded-md flex items-center justify-center text-lg font-medium transition-colors md:w-auto ${!isLoaded ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <DiscordIcon />
                    Login with Discord
                  </Button>
                  <div
                    id="login-with-discord-requirement"
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-marketing-border bg-marketing-card px-3 py-2 text-sm text-marketing-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  >
                    You must have already added Dice Witch to your server to log in with Discord.
                  </div>
                </div>
              )}
            </div>

            <Button
              asChild
              variant="outline"
              className="border-marketing-border bg-transparent px-8 py-3 text-lg text-marketing-foreground hover:bg-marketing-panel hover:text-marketing-foreground"
            >
              <Link to="/docs" className="flex items-center">
                <BookOpen className="mr-3 h-5 w-5" aria-hidden="true" />
                Read the docs
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-marketing-border bg-marketing-surface py-24">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="mb-8 border-b border-marketing-border pb-2 text-center font-mono text-3xl">Why Dice Witch?</h2>
          <div className="grid grid-cols-1 gap-16">
            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">She literally shows you the dice</h3>
              <p className="text-marketing-muted">Dice Witch generates images on the fly as you roll, and presents you with these images right in Discord. Modifiers are represented this way as well</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Designed to simulate the feeling of rolling dice IRL</h3>
              <p className="text-marketing-muted">Rolling dice on Discord lacks the drama and tactility of real life. Dice Witch is about bringing that experience to Discord</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Advanced rolling</h3>
              <p className="text-marketing-muted">Don't worry, Dice Witch supports the complex rolls, modifiers and maths required for your esoteric shed-based hobby</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Saved rolls</h3>
              <p className="text-marketing-muted">Maintain a personal and server library of commonly used rolls and access them quickly in Discord or on the web</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Customize your dice</h3>
              <p className="text-marketing-muted">Choose from a wide array of fonts, materials, and textures that are generated by a literal game engine. Roll with prismatic gemstones, d20s made of lava, or simply use the most busted design you can come up with to entertain your friends</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Web interface</h3>
              <p className="text-marketing-muted">Roll from the web and send the results directly to your Discord channel</p>
            </div>

            {available && (
              <div className="flex flex-col items-start">
                <h3 className="text-2xl font-mono mb-2">Popular</h3>
                <p className="text-marketing-muted">
                  Dice Witch is active in {liveGuilds.toLocaleString()} Discord servers, representing approximately {estimatedGuildMemberships.toLocaleString()} guild memberships. {knownDiceWitchUsers.toLocaleString()} known users have interacted with Dice Witch.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        ref={previewSectionRef}
        className="border-t border-marketing-border bg-marketing-panel py-24"
      >
        <div className="container mx-auto px-4">
          <h2 className="mx-auto mb-8 max-w-4xl border-b border-marketing-border pb-2 text-center font-mono text-3xl text-marketing-accent">Check out a randomized sample of what we're conjuring onto your table here 👇</h2>
          <div className="mx-auto max-w-4xl">
            {previewActive && (
              <React.Suspense fallback={<div className="min-h-96" aria-hidden="true" />}>
                <MarketingAppearancePreview />
              </React.Suspense>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-marketing-border bg-marketing-card py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="font-mono text-marketing-muted">
            © {new Date().getFullYear()} Dice Witch, c/o Christopher Harrison
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
