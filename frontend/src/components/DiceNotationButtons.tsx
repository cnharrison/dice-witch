import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { D4Icon, D6Icon, D8Icon, D10Icon, D12Icon, D20Icon } from '@/components/icons';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100];
const OPERATORS = ['+', '-', '*', '/'];
const KEEP_DROP = ['k', 'kl', 'd', 'dh'];
const EXPLODING = ['!', '!!', '!p'];
const COMPARISON = ['=', '>', '<', '>=', '<='];
const REROLL = ['r', 'ro'];
const UNIQUE = ['u'];
const SUCCESS_FAILURE = ['cs', 'cf'];

interface DiceNotationButtonsProps {
  input: string;
  setInput: (value: string) => void;
  isDisabled?: boolean;
}

export function DiceNotationButtons({ input, setInput, isDisabled = false }: DiceNotationButtonsProps) {
  const { theme } = useTheme();
  const inputRef = React.useRef(input);
  const [longPressTimer, setLongPressTimer] = React.useState<ReturnType<typeof setTimeout> | null>(null);
  const [longPressTarget, setLongPressTarget] = React.useState<number | null>(null);

  React.useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const handleDiceClick = React.useCallback((sides: number) => {
    if (isDisabled) return;

    const sideNotation = sides === 100 ? '%' : sides;
    const currentInput = inputRef.current;

    if (!currentInput) {
      setInput(`1d${sideNotation}`);
      return;
    }

    const dicePattern = new RegExp(`(^|[+\\-*/])\\s*(\\d+)d${sideNotation}(?![\\d%])`, 'g');
    const matches = Array.from(currentInput.matchAll(dicePattern));

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const fullMatch = lastMatch[0];
      const operator = lastMatch[1] || '';
      const count = parseInt(lastMatch[2], 10);
      const newCount = count + 1;

      const position = lastMatch.index;
      const newDiceStr = `${operator}${newCount}d${sideNotation}`;
      const newInput = currentInput.substring(0, position) +
                      newDiceStr +
                      currentInput.substring(position + fullMatch.length);

      setInput(newInput);
    } else {
      const newInput = currentInput === '' || /[\+\-\*\/]$/.test(currentInput)
        ? `${currentInput}1d${sideNotation}`
        : `${currentInput}+1d${sideNotation}`;

      setInput(newInput);
    }
  }, [setInput, isDisabled]);

  const handleOperatorClick = React.useCallback((operator: string) => {
    if (isDisabled) return;

    const currentInput = inputRef.current;
    if (!currentInput) return;

    if (/[\+\-\*\/]$/.test(currentInput)) {
      setInput(currentInput.slice(0, -1) + operator);
    } else if (currentInput && /\d$/.test(currentInput)) {
      setInput(currentInput + operator);
    }
  }, [setInput, isDisabled]);

  const handleModifierClick = React.useCallback((modifier: string) => {
    if (isDisabled) return;

    const currentInput = inputRef.current;
    if (!currentInput) return;

    if (!/\d+d\d+/.test(currentInput)) return;

    if (SUCCESS_FAILURE.includes(modifier)) {
      setInput(currentInput + modifier + '=1');
    } else if (KEEP_DROP.includes(modifier)) {
      setInput(currentInput + modifier + '1');
    } else {
      setInput(currentInput + modifier);
    }
  }, [setInput, isDisabled]);

    const handleNumberClick = React.useCallback((number: number) => {
    if (isDisabled) return;

    const currentInput = inputRef.current;
    if (currentInput === undefined) return;

    setInput(currentInput + number.toString());
  }, [setInput, isDisabled]);

    const handleClearDiceType = React.useCallback((sides: number) => {
    if (isDisabled) return;

    const currentInput = inputRef.current;
    if (!currentInput) return;

    const sideNotation = sides === 100 ? '%' : sides;
    const dicePattern = new RegExp(`(\\+|\\-|\\*|\\/|^)\\d+d${sideNotation}(d\\d+|k\\d+|kl\\d+|dh\\d+|!+|!p|r|ro|cs=\\d+|cf=\\d+|=\\d+|>\\d+|<\\d+|>=\\d+|<=\\d+)*`, 'g');

    let newInput = currentInput.replace(dicePattern, '');

    newInput = newInput.replace(/[\+\-\*\/]{2,}/g, '+');
    newInput = newInput.replace(/^[\+\-\*\/]/, '');
    newInput = newInput.replace(/[\+\-\*\/]$/, '');

    setInput(newInput);
  }, [setInput, isDisabled]);

  const getDieIcon = React.useCallback((sides: number) => {
    const iconProps = {
      className: "w-5 h-5",
      darkMode: theme === 'dark',
    };

    switch (sides) {
      case 4: return <D4Icon {...iconProps} />;
      case 6: return <D6Icon {...iconProps} />;
      case 8: return <D8Icon {...iconProps} />;
      case 10: return <D10Icon {...iconProps} />;
      case 12: return <D12Icon {...iconProps} />;
      case 20: return <D20Icon {...iconProps} />;
      case 100: return <div className="w-5 h-5 flex items-center justify-center font-bold">d%</div>;
      default: return null;
    }
  }, [theme]);

  const handleTouchStart = React.useCallback((sides: number) => {
    if (isDisabled) return;

    const timer = setTimeout(() => {
      handleClearDiceType(sides);
      setLongPressTarget(sides);
    }, 500);

    setLongPressTimer(timer);
  }, [isDisabled, handleClearDiceType]);

  const handleTouchEnd = React.useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setLongPressTarget(null);
  }, [longPressTimer]);

  const getTokenCounts = React.useCallback(() => {
    const diceCounts: Record<number, number> = {};
    const modifierCounts: Record<string, number> = {};
    const currentInput = inputRef.current;


    DICE_TYPES.forEach(type => {
      diceCounts[type] = 0;
    });

    [...KEEP_DROP, ...EXPLODING, ...REROLL, ...UNIQUE, ...SUCCESS_FAILURE].forEach(mod => {
      modifierCounts[mod] = 0;
    });

    if (!currentInput) return { diceCounts, modifierCounts };

    DICE_TYPES.forEach(type => {
      const sideNotation = type === 100 ? '%' : type;
      const pattern = new RegExp(`(\\d+)d${sideNotation}(?![\\d%])`, 'g');
      const matches = Array.from(currentInput.matchAll(pattern));

      if (matches.length > 0) {
        matches.forEach(match => {
          const count = parseInt(match[1], 10);
          diceCounts[type] += count;
        });
      }
    });

    [...KEEP_DROP].forEach(mod => {
      if (mod === 'd') {
        const diceNotations = Array.from(currentInput.matchAll(/\d+d\d+/g));
        let dropCount = 0;

        diceNotations.forEach(diceMatch => {
          const diceEnd = diceMatch.index + diceMatch[0].length;
          if (diceEnd < currentInput.length &&
              currentInput[diceEnd] === 'd' &&
              /\d/.test(currentInput[diceEnd + 1])) {
            dropCount++;
          }
        });

        modifierCounts[mod] = dropCount;
      } else {
        const pattern = new RegExp(`${mod}(\\d+)`, 'g');
        const matches = currentInput.match(pattern);
        if (matches) {
          modifierCounts[mod] = matches.length;
        }
      }
    });

    EXPLODING.forEach(mod => {
      const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'g');
      const matches = currentInput.match(pattern);
      if (matches) {
        modifierCounts[mod] = matches.length;
      }
    });

    REROLL.forEach(mod => {
      const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'g');
      const matches = currentInput.match(pattern);
      if (matches) {
        modifierCounts[mod] = matches.length;
      }
    });
    
    UNIQUE.forEach(mod => {
      const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'g');
      const matches = currentInput.match(pattern);
      if (matches) {
        modifierCounts[mod] = matches.length;
      }
    });

    SUCCESS_FAILURE.forEach(mod => {
      const pattern = new RegExp(`${mod}=\\d+`, 'g');
      const matches = currentInput.match(pattern);
      if (matches) {
        modifierCounts[mod] = matches.length;
      }
    });

    return { diceCounts, modifierCounts };
  }, []);

  // Desktop layout
  const renderDesktopLayout = React.useMemo(() => {
    const { diceCounts, modifierCounts } = getTokenCounts();

    return (
      <div className="h-full flex flex-col">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DICE_TYPES.map((sides) => {
            const count = diceCounts[sides] || 0;
            return (
              <div key={`dice-${sides}`} className="relative flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => handleDiceClick(sides)}
                      disabled={isDisabled}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleClearDiceType(sides);
                      }}
                      className={cn(
                        "h-14 w-14 flex flex-col items-center justify-center p-0",
                        longPressTarget === sides && "bg-red-100"
                      )}
                    >
                      {getDieIcon(sides)}
                      <span className="text-xs mt-1">d{sides === 100 ? '%' : sides}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Click to add d{sides === 100 ? '%' : sides}</p>
                    <p className="text-xs text-muted-foreground">Right-click to reset</p>
                  </TooltipContent>
                </Tooltip>
                {count > 0 && (
                  <span className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center bg-[#ff00ff] text-white text-xs font-bold rounded-full shadow-md">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {OPERATORS.map((op) => (
            <Tooltip key={`op-${op}`}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handleOperatorClick(op)}
                  disabled={isDisabled}
                  className="h-10"
                >
                  {op}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{op === '+' ? 'Add' : op === '-' ? 'Subtract' : op === '*' ? 'Multiply' : 'Divide'}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {KEEP_DROP.map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <Tooltip key={`mod-desktop-${mod}`}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifierClick(mod)}
                      disabled={isDisabled}
                      className="h-10 w-full"
                    >
                      {mod === 'k' ? 'keep' :
                      mod === 'kl' ? 'keepL' :
                      mod === 'd' ? 'drop' :
                      'dropH'}
                    </Button>
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-xs font-bold rounded-full shadow-md">
                        {count}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {mod === 'k' ? 'Keep highest' :
                    mod === 'kl' ? 'Keep lowest' :
                    mod === 'd' ? 'Drop lowest' :
                    'Drop highest'}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {[...EXPLODING, 'r'].map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <Tooltip key={`mod-desktop-${mod}`}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifierClick(mod)}
                      disabled={isDisabled}
                      className="h-10 w-full"
                    >
                      {mod}
                    </Button>
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-xs font-bold rounded-full shadow-md">
                        {count}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {mod === '!' ? 'Exploding' :
                     mod === '!!' ? 'Compounding' :
                     mod === '!p' ? 'Penetrating' :
                     mod === 'r' ? 'Reroll once' : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {[...SUCCESS_FAILURE, REROLL[1], ...UNIQUE].map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <Tooltip key={`mod-desktop-${mod}`}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifierClick(mod)}
                      disabled={isDisabled}
                      className="h-10 w-full"
                    >
                      {mod}
                    </Button>
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-xs font-bold rounded-full shadow-md">
                        {count}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {mod === 'cs' ? 'Critical success' :
                     mod === 'cf' ? 'Critical failure' :
                     mod === 'ro' ? 'Reroll until no match' :
                     mod === 'u' ? 'Unique' :
                     'Equal to'}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {COMPARISON.slice(1).map((mod) => (
            <Tooltip key={`mod-desktop-${mod}`}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled}
                  className="h-10 w-full"
                >
                  {mod}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Comparison operator</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex-1 grid grid-cols-3 gap-2">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
            <Button
              key={`num-${num}`}
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick(num)}
              disabled={isDisabled}
              className="h-10"
            >
              {num}
            </Button>
          ))}
          <Button
            key="num-0"
            variant="outline"
            size="lg"
            onClick={() => handleNumberClick(0)}
            disabled={isDisabled}
            className="col-span-3 h-10"
          >
            0
          </Button>
        </div>
      </div>
    );
  }, [getTokenCounts, getDieIcon, handleDiceClick, handleClearDiceType, handleModifierClick, handleNumberClick, handleOperatorClick, isDisabled, longPressTarget]);

  const renderMobileLayout = React.useMemo(() => {
    const { diceCounts, modifierCounts } = getTokenCounts();

    return (
      <>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DICE_TYPES.map((sides) => {
            const count = diceCounts[sides] || 0;
            return (
              <Tooltip key={`dice-mobile-${sides}`}>
                <TooltipTrigger asChild>
                  <div className="relative flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDiceClick(sides)}
                      disabled={isDisabled}
                      onTouchStart={() => handleTouchStart(sides)}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      className={cn(
                        "h-10 w-10 flex flex-col items-center justify-center p-0",
                        longPressTarget === sides && "bg-red-100"
                      )}
                    >
                      <span className="text-xs font-semibold">d{sides === 100 ? '%' : sides}</span>
                    </Button>
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                        {count}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Tap to add d{sides === 100 ? '%' : sides}</p>
                  <p className="text-xs text-muted-foreground">Long-press to remove</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-1 mb-1">
          {OPERATORS.map((op) => (
            <Button
              key={`op-mobile-${op}`}
              variant="outline"
              size="sm"
              onClick={() => handleOperatorClick(op)}
              disabled={isDisabled}
              className="h-9"
            >
              {op}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-1 mb-1">
          <div className="col-span-9">
            <div className="grid grid-cols-3 gap-1">
              {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
                <Button
                  key={`num-mobile-${num}`}
                  variant="outline"
                  size="sm"
                  onClick={() => handleNumberClick(num)}
                  disabled={isDisabled}
                  className="h-9"
                >
                  {num}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              <Button
                key="num-mobile-0"
                variant="outline"
                size="sm"
                onClick={() => handleNumberClick(0)}
                disabled={isDisabled}
                className="col-span-3 h-9"
              >
                0
              </Button>
            </div>
          </div>
          <div className="col-span-3">
            <div className="grid grid-rows-2 h-full gap-1">
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick('k')}
                  disabled={isDisabled}
                  className="h-full w-full"
                >
                  keep
                </Button>
                {modifierCounts['k'] > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                    {modifierCounts['k']}
                  </span>
                )}
              </div>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick('!')}
                  disabled={isDisabled}
                  className="h-full w-full"
                >
                  !
                </Button>
                {modifierCounts['!'] > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                    {modifierCounts['!']}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {KEEP_DROP.filter(m => m !== 'k').map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <div key={`mod-mobile-${mod}`} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled}
                  className="h-9 w-full"
                >
                  {mod}
                </Button>
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-1 mt-1">
          {EXPLODING.filter(m => m !== '!').concat(REROLL).map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <div key={`mod-mobile-${mod}`} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled}
                  className="h-9 w-full"
                >
                  {mod}
                </Button>
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-1 mt-1">
          {SUCCESS_FAILURE.concat([COMPARISON[0], ...UNIQUE]).map((mod) => {
            const count = modifierCounts[mod] || 0;
            return (
              <div key={`mod-mobile-${mod}`} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled}
                  className="h-9 w-full"
                >
                  {mod}
                </Button>
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-[#ff00ff] text-white text-[10px] font-bold rounded-full shadow-md">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }, [getTokenCounts, handleDiceClick, handleModifierClick, handleNumberClick, handleOperatorClick, handleTouchEnd, handleTouchStart, isDisabled, longPressTarget]);

  return (
    <TooltipProvider>
      <div className="dice-notation-buttons p-2 h-full flex flex-col">
        {typeof window !== 'undefined' && window.innerWidth < 640
          ? renderMobileLayout
          : renderDesktopLayout}
      </div>
    </TooltipProvider>
  );
}