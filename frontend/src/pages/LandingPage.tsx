import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useSignIn } from '@/lib/AuthProvider';
import { Button } from "@/components/ui/button";
import { PreviewRoller } from '@/components/PreviewRoller';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useServerStats } from '@/hooks/useServerStats';
import { SvgFilters } from '@/components/SvgFilters';

const LandingPage = () => {
  const { isSignedIn } = useAuth();
  const { signIn, isLoaded } = useSignIn();
  const { servers, users, loading, error, available } = useServerStats();

  const handleSignInWithDiscord = () => {
    if (!isLoaded) return;
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.dicewit.ch';
      window.location.href = `${API_BASE}/api/auth/signin/discord`;
    } catch (error) {
      console.error('Authentication error:', error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-mono">
      <SvgFilters />
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="relative w-60 h-60 md:w-80 md:h-80 mx-auto mb-16">
            <div className="aspect-square overflow-hidden rounded-full border border-zinc-800">
              <img
                src="/images/dice-witch-banner.webp"
                alt="Dice Witch"
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
                  fontSize="15"
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
                  fontSize="15"
                  letterSpacing="1"
                >
                  <tspan fontWeight="900" fontSize="17">CLATTER</tspan> <tspan dy="2">ACROSS</tspan>
                </text>
                <text
                  x="125"
                  y="90"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'Bangers', cursive, sans-serif"
                  fontWeight="bold"
                  fontSize="15"
                  letterSpacing="1"
                >
                  THE TABLE...
                </text>
              </svg>
            </div>

          </div>

          <h1 className="font-['UnifrakturMaguntia'] text-[#ff00ff] text-6xl md:text-8xl mb-8">
            Dice Witch
          </h1>

          <p className="text-xl md:text-2xl mb-12 max-w-2xl mx-auto text-zinc-400 border-t border-b border-zinc-800 py-4">
            A dice roller for Discord with panache
          </p>

          <div className="flex flex-col md:flex-row justify-center gap-4">
            {isSignedIn ? (
              <Button asChild className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-8 py-3 rounded-md flex items-center justify-center text-lg font-medium transition-colors">
                <Link to="/app" className="flex items-center">
                  <svg
                    width="24"
                    height="18"
                    viewBox="0 0 24 18"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-3"
                  >
                    <path d="M19.958 1.5C18.465.58 16.841.127 15.144 0c-.153.29-.34.68-.463 1.003-1.83-.28-3.646-.28-5.44 0-.122-.322-.319-.71-.463-.995C7.074.122 5.446.576 3.958 1.493c-2.51 3.71-3.19 7.337-2.853 10.914 1.67 1.226 3.292 1.973 4.883 2.464.392-.533.74-1.1 1.043-1.695-.574-.216-1.122-.48-1.643-.79.138-.1.273-.207.405-.317 3.19 1.464 6.651 1.464 9.797 0 .133.11.271.213.405.317-.522.31-1.07.58-1.643.79.303.595.649 1.162 1.044 1.695 1.595-.488 3.217-1.238 4.887-2.464.394-4.144-.667-7.737-2.907-10.917l-.016.004zm-10.03 8.78c-.954 0-1.734-.871-1.734-1.943 0-1.07.759-1.941 1.734-1.941.976 0 1.752.875 1.735 1.941 0 1.072-.76 1.944-1.735 1.944zm6.414 0c-.954 0-1.734-.871-1.734-1.943 0-1.07.76-1.941 1.734-1.941.975 0 1.752.875 1.734 1.941 0 1.072-.759 1.944-1.734 1.944z"/>
                  </svg>
                  Launch App
                </Link>
              </Button>
            ) : (
              <Button
                onClick={handleSignInWithDiscord}
                disabled={!isLoaded}
                className={`bg-[#5865F2] hover:bg-[#4752C4] text-white px-8 py-3 rounded-md flex items-center justify-center text-lg font-medium transition-colors ${!isLoaded ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <svg
                  width="24"
                  height="18"
                  viewBox="0 0 24 18"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-3"
                >
                  <path d="M19.958 1.5C18.465.58 16.841.127 15.144 0c-.153.29-.34.68-.463 1.003-1.83-.28-3.646-.28-5.44 0-.122-.322-.319-.71-.463-.995C7.074.122 5.446.576 3.958 1.493c-2.51 3.71-3.19 7.337-2.853 10.914 1.67 1.226 3.292 1.973 4.883 2.464.392-.533.74-1.1 1.043-1.695-.574-.216-1.122-.48-1.643-.79.138-.1.273-.207.405-.317 3.19 1.464 6.651 1.464 9.797 0 .133.11.271.213.405.317-.522.31-1.07.58-1.643.79.303.595.649 1.162 1.044 1.695 1.595-.488 3.217-1.238 4.887-2.464.394-4.144-.667-7.737-2.907-10.917l-.016.004zm-10.03 8.78c-.954 0-1.734-.871-1.734-1.943 0-1.07.759-1.941 1.734-1.941.976 0 1.752.875 1.735 1.941 0 1.072-.76 1.944-1.735 1.944zm6.414 0c-.954 0-1.734-.871-1.734-1.943 0-1.07.76-1.941 1.734-1.941.975 0 1.752.875 1.734 1.941 0 1.072-.759 1.944-1.734 1.944z"/>
                </svg>
                Continue with Discord
              </Button>
            )}

            <Button
              asChild
              className="bg-[#ff00ff] hover:bg-[#cc00cc] text-white px-8 py-3 rounded-md flex items-center justify-center text-lg font-medium transition-colors border border-[#ff66ff] shadow-[0_0_15px_rgba(255,0,255,0.5)]"
            >
              <a
                href="https://discord.com/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot%20applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <svg
                  width="24"
                  height="24"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  className="mr-3"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                Add to Discord
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-24 border-t border-zinc-900 bg-[#120012]">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-mono mb-8 text-center border-b border-zinc-800 pb-2">Why Dice Witch?</h2>
          <div className="grid grid-cols-1 gap-16">
            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">She literally shows you the dice</h3>
              <p className="text-zinc-400">Dice Witch generates images on the fly as you roll, and presents you with these images right in Discord. Modifiers are represented this way as well</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Designed to simulate the feeling of rolling dice IRL</h3>
              <p className="text-zinc-400">Rolling dice on Discord lacks the drama and tactility of real life. Dice Witch is about bringing that experience to Discord</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Advanced rolling</h3>
              <p className="text-zinc-400">Don't worry, Dice Witch supports the complex rolls and modifiers required for your esoteric shed-based hobby</p>
            </div>

            <div className="flex flex-col items-start">
              <h3 className="text-2xl font-mono mb-2">Web interface</h3>
              <p className="text-zinc-400">You can control the bot from the web as a GM</p>
            </div>

            {available && (
              <div className="flex flex-col items-start">
                <h3 className="text-2xl font-mono mb-2">Popular</h3>
                <p className="text-zinc-400">
                  Dice Witch is used in {servers.toLocaleString()} Discord servers by a total of {users.toLocaleString()} people
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-24 border-t border-zinc-900 bg-[#1a1a1a]">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-mono mb-8 text-center border-b border-zinc-800 pb-2 text-[#9933ff]">Roll</h2>
          <p className="text-xl text-center mb-8 text-zinc-300 max-w-2xl mx-auto">You came here to roll, didn't you? Roll. (Note that these results won't be sent to Discord or anywhere else)</p>
          <div className="max-w-5xl mx-auto">
            <div className="preview-section rounded-lg p-6 shadow-lg bg-[#121212] border border-[#333333]">
              <TooltipProvider>
                <PreviewRoller />
              </TooltipProvider>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-zinc-900 mt-auto bg-[#0f0f0f]">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400 font-mono">
            © {new Date().getFullYear()} Dice Witch, c/o Christopher Harrison
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
