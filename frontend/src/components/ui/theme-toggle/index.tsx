import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label="Toggle theme"
      className="h-12 w-12 p-0"
    >
      <Sun 
        size={40} 
        className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" 
      />
      <Moon 
        size={40} 
        className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" 
      />
    </Button>
  );
}