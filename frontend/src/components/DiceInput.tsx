import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as React from "react";

interface DiceInputProps {
  input: string;
  setInput: (value: string) => void;
  isValid: boolean;
  onRoll?: () => void;
}

export function DiceInput({ input, setInput, isValid, onRoll }: DiceInputProps) {
  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, [setInput]);

  const handleClearInput = React.useCallback(() => {
    setInput('');
  }, [setInput]);
  
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValid && onRoll) {
      onRoll();
    }
  }, [isValid, onRoll]);

  return (
    <div className="w-full mt-4">
      <div className="relative w-full">
        <Input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter dice roll (e.g., 2d20+3d8+5)"
          className={cn(
            "w-full pr-10",
            !isValid && "text-red-500"
          )}
        />
        {input && (
          <button 
            onClick={handleClearInput}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label="Clear input"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}