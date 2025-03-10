import { useUser, useAuth } from "@/lib/AuthProvider";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { LogOut, Settings, Box, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ThemeToggle } from "./ui/theme-toggle";
import { MobileMenu } from "./MobileMenu";

export function Navbar() {
  const { signOut } = useAuth();
  const { user } = useUser();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase();
  };

  return (
    <nav className="border-b border-border bg-background">
      <div className="sm:hidden flex items-center justify-between px-4 py-2">
        <div className="flex-1 flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.image} alt={user?.name || "User"} />
            <AvatarFallback>
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {user?.name || "User"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>

      <div className="hidden sm:flex items-center px-3 py-2">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.image} alt={user?.name || "User"} />
            <AvatarFallback>
              {user?.name ? getInitials(user.name) : (user?.name?.[0] || "U")}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {user?.name || "User"}
          </span>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <Link to="/app" replace>
            <Button variant="ghost" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Roll
            </Button>
          </Link>
          <Link to="/app/preferences" replace>
            <Button variant="ghost" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Preferences
            </Button>
          </Link>
          <ThemeToggle />
          <Button
            variant="ghost"
            onClick={() => signOut()}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}