import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { D20Icon } from '@/components/icons/D20Icon';
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

interface DiceInputProps {
  input: string;
  setInput: (value: string) => void;
  isValid: boolean;
  onRoll?: () => void;
  timesToRepeat?: number;
  onTimesToRepeatChange?: (value: number) => void;
  selectedChannel: boolean;
  rollTitle?: string;
  onRollTitleChange?: (value: string) => void;
}

export function DiceInput({ 
  input, 
  setInput, 
  isValid, 
  onRoll, 
  timesToRepeat = 1, 
  onTimesToRepeatChange, 
  selectedChannel, 
  rollTitle = '', 
  onRollTitleChange 
}: DiceInputProps) {
  const diceInputRef = React.useRef<HTMLInputElement>(null);
  const timesToRepeatRef = React.useRef<HTMLInputElement>(null);
  const { theme } = useTheme();

  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, [setInput]);

  const handleClearInput = React.useCallback(() => {
    setInput('');
    if (onRollTitleChange) {
      onRollTitleChange('');
    }
    if (onTimesToRepeatChange) {
      onTimesToRepeatChange(1);
    }
  }, [setInput, onRollTitleChange, onTimesToRepeatChange]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValid && selectedChannel && input.trim()) {
      if (onRoll) onRoll();
    }
  }, [isValid, selectedChannel, input, onRoll]);

  const handleDiceInputKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    handleKeyDown(e);
  }, [handleKeyDown]);

  const handleTimesToRepeatChange = React.useCallback((newValue: number) => {
    if (onTimesToRepeatChange) {
      onTimesToRepeatChange(Math.max(1, newValue));
    }
  }, [onTimesToRepeatChange]);

  const handleTimesToRepeatKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onTimesToRepeatChange(Math.max(1, timesToRepeat + 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onTimesToRepeatChange(Math.max(1, timesToRepeat - 1));
    }
  }, [timesToRepeat, onTimesToRepeatChange]);

  return (
    <TooltipProvider>
      <div className="flex items-center space-x-2 mt-4">
        <div className="relative flex-grow">
          <Input
            ref={diceInputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleDiceInputKeyDown}
            placeholder={selectedChannel ? "Enter dice roll (e.g., 2d20+3d8+5)" : "Select a channel first, then enter dice"}
            className={cn(
              "w-full pr-10",
              !isValid && "text-red-500",
              !selectedChannel && "border-amber-500"
            )}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearInput}
              className="h-7 w-7"
              tabIndex={-1}
            >
              ✕
            </Button>
            <div
              onClick={() => isValid && selectedChannel && input.trim() && onRoll && onRoll()}
              className={cn(
                "cursor-pointer transition-opacity duration-300",
                (!isValid || !selectedChannel || !input.trim()) && "opacity-50 cursor-not-allowed"
              )}
            >
              <D20Icon
                className={cn(
                  "h-5 w-5",
                  (!isValid || !selectedChannel || !input.trim())
                    ? "text-white"
                    : ""
                )}
                darkMode={theme === 'dark'}
                disabled={!isValid || !selectedChannel || !input.trim()}
                shouldGlow={isValid && selectedChannel && input.trim()}
                glowColor="#ff00ff"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Input
            id="roll-title"
            type="text"
            value={rollTitle}
            onChange={(e) => onRollTitleChange?.(e.target.value)}
            placeholder="Roll title"
            className="w-32"
          />
        </div>
        {timesToRepeat > 0 && (
          <div className="flex items-center space-x-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative w-16">
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">x</div>
                  <Input
                    id="repeat"
                    type="tel"
                    min="1"
                    max="20"
                    value={timesToRepeat}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      onTimesToRepeatChange?.(isNaN(value) ? 1 : value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        onTimesToRepeatChange?.(Math.min(20, timesToRepeat + 1));
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        onTimesToRepeatChange?.(Math.max(1, timesToRepeat - 1));
                      }
                    }}
                    className="text-center pl-5 pr-6"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTimesToRepeatChange?.(Math.min(20, timesToRepeat + 1))}
                      className="h-4 w-4 p-0"
                      tabIndex={-1}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTimesToRepeatChange?.(Math.max(1, timesToRepeat - 1))}
                      className="h-4 w-4 p-0"
                      tabIndex={-1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Times to repeat roll</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}