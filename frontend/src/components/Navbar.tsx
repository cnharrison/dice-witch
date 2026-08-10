import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BookOpen, Bookmark, Box, LogOut, Settings } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { MobileMenu } from "./MobileMenu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useAuth, useUser } from "@/lib/AuthProvider";
import {
  loadDocsApp,
  loadHomePage,
  loadLibraryPage,
  loadPreferencesPage,
} from "@/lib/app-route-loaders";
import {
  PERSONAL_APPEARANCE_BOOTSTRAP_QUERY_KEY,
  PERSONAL_APPEARANCE_STALE_TIME_MS,
} from "@/lib/appearance-query";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function Navbar() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { user } = useUser();
  const userName = user?.name || "User";
  const prefetchPreferences = () => {
    void loadPreferencesPage();
    void queryClient.prefetchQuery({
      queryKey: PERSONAL_APPEARANCE_BOOTSTRAP_QUERY_KEY,
      queryFn: async () => {
        const appearance = await import("@/lib/appearance-v3");
        return appearance.getPersonalAppearanceBootstrapV3();
      },
      staleTime: PERSONAL_APPEARANCE_STALE_TIME_MS,
    });
  };

  return (
    <nav className="sticky top-0 z-50 h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex h-full items-center px-3 sm:px-4">
        <Link
          to="/app"
          replace
          className="flex h-full items-center font-['UnifrakturMaguntia'] text-[2.5rem] leading-none text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Dice Witch
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <Link
              to="/app"
              replace
              onMouseEnter={() => void loadHomePage()}
              onFocus={() => void loadHomePage()}
            >
              <Button variant="ghost" className="flex items-center gap-2">
                <Box className="h-4 w-4" aria-hidden="true" />
                Roll
              </Button>
            </Link>
            <Link
              to="/app/library"
              replace
              onMouseEnter={() => void loadLibraryPage()}
              onFocus={() => void loadLibraryPage()}
            >
              <Button variant="ghost" className="flex items-center gap-2">
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                Library
              </Button>
            </Link>
            <Link
              to="/app/preferences"
              replace
              onMouseEnter={prefetchPreferences}
              onFocus={prefetchPreferences}
            >
              <Button variant="ghost" className="flex items-center gap-2">
                <Settings className="h-4 w-4" aria-hidden="true" />
                Preferences
              </Button>
            </Link>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/docs"
                    aria-label="Docs"
                    onMouseEnter={() => void loadDocsApp()}
                    onFocus={() => void loadDocsApp()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Docs</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="sm:hidden">
            <MobileMenu />
          </div>
          <ThemeToggle />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full p-0"
                aria-label={`Open account menu for ${userName}`}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.image ?? undefined} alt="" />
                  <AvatarFallback>{initials(userName) || "U"}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                  onSelect={() => signOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  Logout {userName}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </nav>
  );
}
