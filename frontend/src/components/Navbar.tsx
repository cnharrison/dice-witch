import { useClerk, useUser } from "@clerk/clerk-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { LogOut, Settings, Box, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ThemeToggle } from "./ui/theme-toggle";
import { MobileMenu } from "./MobileMenu";

export function Navbar() {
  const { signOut } = useClerk();
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
            <AvatarImage src={user?.imageUrl} alt={user?.username || user?.fullName || "User"} />
            <AvatarFallback>
              {user?.fullName ? getInitials(user.fullName) : (user?.username?.[0] || "U")}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {user?.username || user?.fullName || "User"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <MobileMenu username={user?.username || user?.fullName || "User"} />
        </div>
      </div>

      <div className="hidden sm:flex items-center px-3 py-2">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.imageUrl} alt={user?.username || user?.fullName || "User"} />
            <AvatarFallback>
              {user?.fullName ? getInitials(user.fullName) : (user?.username?.[0] || "U")}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {user?.username || user?.fullName || "User"}
          </span>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <Link to="/app">
            <Button variant="ghost" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Roll
            </Button>
          </Link>
          <Link to="/app/preferences">
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