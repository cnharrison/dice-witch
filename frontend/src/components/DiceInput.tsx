import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as React from "react";

interface DiceInputProps {
  input: string;
  setInput: (value: string) => void;
  isValid: boolean;
}

export function DiceInput({ input, setInput, isValid }: DiceInputProps) {
  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, [setInput]);

  return (
    <div className="w-full mt-4">
      <Input
        type="text"
        value={input}
        onChange={handleInputChange}
        placeholder="Enter dice roll (e.g., 2d20+3d8+5)"
        className={cn(
          "w-full",
          !isValid && "text-red-500"
        )}
      />
    </div>
  )
}