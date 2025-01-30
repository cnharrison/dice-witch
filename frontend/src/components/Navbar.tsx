import { useClerk } from "@clerk/clerk-react";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";

export function Navbar() {
  const { signOut } = useClerk();

  return (
    <nav className="border-b">
      <div className="flex items-center px-3">
        <div className="flex items-center font-semibold">
          Dice Witch
        </div>
        <div className="ml-auto flex items-center space-x-4">
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