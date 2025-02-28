import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
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

    const selectionEvent = new CustomEvent('diceInputSelectionChange', {
      detail: {
        selectionStart: e.target.selectionStart,
        selectionEnd: e.target.selectionEnd
      }
    });
    e.target.dispatchEvent(selectionEvent);
  }, [setInput]);

  const handleInputSelect = React.useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    const selectionEvent = new CustomEvent('diceInputSelectionChange', {
      detail: {
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd
      }
    });
    window.dispatchEvent(selectionEvent);
  }, []);

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
      {/* Mobile layout */}
      <div className="sm:hidden flex flex-col space-y-2 mt-4">
        {/* Row 1: Dice Input (full width) */}
        <div className="relative w-full">
          <Input
            ref={diceInputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleDiceInputKeyDown}
            onSelect={handleInputSelect}
            placeholder={selectedChannel ? "Enter dice roll (e.g., 2d20+3d8+5)" : "Select a channel first, then enter dice"}
            disabled={!selectedChannel}
            className={cn(
              "w-full pr-10",
              !isValid && "text-red-500",
              !selectedChannel && "border-amber-500 opacity-50"
            )}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            {(input !== '' || rollTitle !== '' || timesToRepeat > 1) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearInput}
                className="h-7 w-7"
                tabIndex={-1}
                disabled={!selectedChannel}
              >
                ✕
              </Button>
            )}
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

        {/* Row 2: Roll title and times to repeat */}
        <div className="flex items-center space-x-2 w-full">
          <div className="flex-grow">
            <Input
              id="mobile-roll-title"
              type="text"
              value={rollTitle}
              onChange={(e) => onRollTitleChange?.(e.target.value)}
              placeholder="Roll title"
              disabled={!selectedChannel}
              className={cn(
                "w-full",
                !selectedChannel && "opacity-50"
              )}
            />
          </div>

          {timesToRepeat > 0 && (
            <div className="flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative w-16">
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">x</div>
                    <Input
                      id="mobile-repeat"
                      type="tel"
                      min="1"
                      max="20"
                      value={timesToRepeat}
                      disabled={!selectedChannel}
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
                      className={cn(
                        "text-center pl-5 pr-6",
                        !selectedChannel && "opacity-50"
                      )}
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onTimesToRepeatChange?.(Math.min(20, timesToRepeat + 1))}
                        className="h-4 w-4 p-0"
                        tabIndex={-1}
                        disabled={!selectedChannel}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onTimesToRepeatChange?.(Math.max(1, timesToRepeat - 1))}
                        className="h-4 w-4 p-0"
                        tabIndex={-1}
                        disabled={!selectedChannel}
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
      </div>

      <div className="hidden sm:flex items-center space-x-2 mt-4">
        <div className="relative flex-grow">
          <Input
            ref={diceInputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleDiceInputKeyDown}
            onSelect={handleInputSelect}
            placeholder={selectedChannel ? "Enter dice roll (e.g., 2d20+3d8+5)" : "Select a channel first, then enter dice"}
            disabled={!selectedChannel}
            className={cn(
              "w-full pr-10",
              !isValid && "text-red-500",
              !selectedChannel && "border-amber-500 opacity-50"
            )}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            {(input !== '' || rollTitle !== '' || timesToRepeat > 1) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearInput}
                className="h-7 w-7"
                tabIndex={-1}
                disabled={!selectedChannel}
              >
                ✕
              </Button>
            )}
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
            disabled={!selectedChannel}
            className={cn(
              "w-32",
              !selectedChannel && "opacity-50"
            )}
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
                    disabled={!selectedChannel}
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
                    className={cn(
                      "text-center pl-5 pr-6",
                      !selectedChannel && "opacity-50"
                    )}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTimesToRepeatChange?.(Math.min(20, timesToRepeat + 1))}
                      className="h-4 w-4 p-0"
                      tabIndex={-1}
                      disabled={!selectedChannel}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTimesToRepeatChange?.(Math.max(1, timesToRepeat - 1))}
                      className="h-4 w-4 p-0"
                      tabIndex={-1}
                      disabled={!selectedChannel}
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