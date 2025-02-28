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
const SUCCESS_FAILURE = ['cs', 'cf'];

type DiceCountsType = Record<number, number>;
type ModifierCountsType = Record<string, number>;

interface DiceNotationButtonsProps {
  input: string;
  setInput: (value: string) => void;
  isDisabled?: boolean;
}

export function DiceNotationButtons({ input, setInput, isDisabled = false }: DiceNotationButtonsProps) {
  const { theme } = useTheme();
  const inputRef = React.useRef(input);
  const [selectionStart, setSelectionStart] = React.useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null);
  const [diceCounts, setDiceCounts] = React.useState<DiceCountsType>({});
  const diceCountsRef = React.useRef<DiceCountsType>({});

  const [modifierCounts, setModifierCounts] = React.useState<ModifierCountsType>({});
  const modifierCountsRef = React.useRef<ModifierCountsType>({});
  const [totalDiceCount, setTotalDiceCount] = React.useState<number>(0);
  const [longPressModifier, setLongPressModifier] = React.useState<string | null>(null);

  React.useEffect(() => {
    inputRef.current = input;
    
    const newCounts: DiceCountsType = {};
    DICE_TYPES.forEach(type => {
      newCounts[type] = 0;
    });
    
    const diceRegex = /(\d+)d(\d+|\%)/g;
    let match;
    let totalDice = 0;
    
    while ((match = diceRegex.exec(input)) !== null) {
      const count = parseInt(match[1], 10);
      const size = match[2] === '%' ? 100 : parseInt(match[2], 10);
      if (DICE_TYPES.includes(size)) {
        newCounts[size] = count;
        totalDice += count;
      }
    }
    
    diceCountsRef.current = newCounts;
    setDiceCounts(newCounts);
    setTotalDiceCount(totalDice);
    
    const newModifierCounts: ModifierCountsType = {};
    
    [...KEEP_DROP, ...SUCCESS_FAILURE].forEach(mod => {
      newModifierCounts[mod] = 0;
    });
    
    const kdRegex = /(\d+d\d+.*?)(k|kl|dh)(\d+)/g;
    while ((match = kdRegex.exec(input)) !== null) {
      const modifier = match[2];
      const count = parseInt(match[3], 10);
      newModifierCounts[modifier] = count;
    }
    
    const dRegex = /(\d+d\d+.*?)([^d]d)(\d+)/g;
    while ((match = dRegex.exec(input)) !== null) {
      const count = parseInt(match[3], 10);
      newModifierCounts['d'] = count;
    }
    
    const csRegex = /(cs|cf)(=|<=|>=|<|>)?(\d+)/g;
    while ((match = csRegex.exec(input)) !== null) {
      const modifier = match[1];
      const value = parseInt(match[3], 10);
      newModifierCounts[modifier] = value;
    }
    
    modifierCountsRef.current = newModifierCounts;
    setModifierCounts(newModifierCounts);
  }, [input]);

  const diceState = React.useMemo(() => {
    const currentInput = inputRef.current;
    
    if (!currentInput) {
      return {
        hasDice: false,
        hasOperator: false,
        hasModifier: false,
        canAddNumber: true,
        canAddDice: true,
        canAddOperator: false,
        canAddModifier: false,
        canAddComparison: false,
      };
    }

    const hasDice = /\d+d\d+/.test(currentInput);
    const lastCharIsDigit = /\d$/.test(currentInput);
    const endsWithDice = /\d+d\d+$/.test(currentInput);
    const endsWithNumber = /\d$/.test(currentInput);
    const hasOperator = /[\+\-\*\/]/.test(currentInput);
    const endsWithOperator = /[\+\-\*\/]$/.test(currentInput);
    const hasModifier = /[kd!rcs]/.test(currentInput);
    const endsWithModifier = /[!]$/.test(currentInput) || /[kd]\d*$/.test(currentInput);
    
    return {
      hasDice,
      hasOperator,
      hasModifier,
      canAddNumber: true,
      canAddDice: true,
      canAddOperator: lastCharIsDigit || endsWithDice,
      canAddModifier: hasDice,
      canAddComparison: true,
    };
  }, [inputRef.current]);

  const updateDiceCount = React.useCallback((sides: number) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    const currentCounts = { ...diceCountsRef.current };
    
    currentCounts[sides] = (currentCounts[sides] || 0) + 1;
    diceCountsRef.current = currentCounts;
    
    const sideNotation = sides === 100 ? '%' : sides;
    
    if (!currentInput) {
      setInput(`1d${sideNotation}`);
      return;
    }
    
    const diceRegex = new RegExp(`(\\d+)d${sideNotation}`, 'g');
    const match = diceRegex.exec(currentInput);
    
    if (match) {
      const count = parseInt(match[1], 10) + 1;
      const newInput = currentInput.substring(0, match.index) + 
                       `${count}d${sideNotation}` + 
                       currentInput.substring(match.index + match[0].length);
      setInput(newInput);
    } else {
      if (currentInput === '' || /[\+\-\*\/]$/.test(currentInput)) {
        setInput(`${currentInput}1d${sideNotation}`);
      } else {
        setInput(`${currentInput}+1d${sideNotation}`);
      }
    }
  }, [setInput, isDisabled]);

  const resetDiceCounts = React.useCallback((sides: number) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    if (!currentInput) return;
    
    const currentCounts = { ...diceCountsRef.current };
    currentCounts[sides] = 0;
    diceCountsRef.current = currentCounts;
    
    const sideNotation = sides === 100 ? '%' : sides;
    const diceRegex = new RegExp(`(\\d+)d${sideNotation}`, 'g');
    
    let newInput = currentInput;
    while (diceRegex.exec(newInput) !== null) {
      newInput = newInput.replace(diceRegex, '');
    }
    
    newInput = newInput.replace(/\+\+/g, '+').replace(/\-\+/g, '-').replace(/\+\-/g, '-');
    newInput = newInput.replace(/^\+/, '').replace(/\+$/, '').replace(/\-$/, '');
    
    setInput(newInput);
  }, [setInput, isDisabled]);

  const handleOperatorClick = React.useCallback((operator: string) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    if (!currentInput) return;
    
    if (/[\+\-\*\/]$/.test(currentInput)) {
      setInput(currentInput.slice(0, -1) + operator);
    } else if (currentInput) {
      setInput(currentInput + operator);
    }
  }, [setInput, isDisabled]);

  const handleModifierClick = React.useCallback((modifier: string) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    if (!currentInput) return;
    
    const diceRegex = /(\d+)d(\d+|\%)/g;
    let match;
    let lastMatch = null;
    let lastIndex = 0;
    let lastDiceCount = 0;
    let diceSize = 0;
    
    while ((match = diceRegex.exec(currentInput)) !== null) {
      lastMatch = match;
      lastIndex = match.index + match[0].length;
      lastDiceCount = parseInt(match[1], 10);
      diceSize = match[2] === '%' ? 100 : parseInt(match[2], 10);
    }
    
    if (!lastMatch) return;
    
    if (KEEP_DROP.includes(modifier)) {
      const currentCount = modifierCountsRef.current[modifier] || 0;
      const newCount = currentCount + 1;
      
      if (newCount > lastDiceCount && lastDiceCount > 0) {
        return;
      }
      
      const escapedModifier = modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let modRegex;
      let modMatch;
      let modFound = false;
      let newInput = currentInput;
      
      if (modifier === 'd') {
        const dSuffix = `([^d]|$)${escapedModifier}`;
        modRegex = new RegExp(`(\\d+d\\d+.*?)(${dSuffix})(\\d*)`, 'g');
        
        let lastDiceEnd = 0;
        let diceMatches = [];
        while ((match = diceRegex.exec(currentInput)) !== null) {
          diceMatches.push({
            start: match.index,
            end: match.index + match[0].length
          });
          lastDiceEnd = Math.max(lastDiceEnd, match.index + match[0].length);
        }
        
        const suffix = currentInput.substring(lastDiceEnd);
        const dModRegex = /([^d]|^)d(\d*)/g;
        let dModMatch;
        
        while ((dModMatch = dModRegex.exec(suffix)) !== null) {
          modFound = true;
          const matchStart = lastDiceEnd + dModMatch.index;
          const fullMatch = dModMatch[0];
          const prefix = dModMatch[1];
          newInput = newInput.substring(0, matchStart) + 
                    prefix + 'd' + newCount + 
                    newInput.substring(matchStart + fullMatch.length);
          break;
        }
        
        if (!modFound) {
          newInput = currentInput.substring(0, lastIndex) + 
                   'd' + newCount + 
                   currentInput.substring(lastIndex);
        }
      } else {
        modRegex = new RegExp(`${escapedModifier}(\\d+)?`, 'g');
        
        while ((modMatch = modRegex.exec(currentInput)) !== null) {
          modFound = true;
          newInput = newInput.substring(0, modMatch.index) + 
                   `${modifier}${newCount}` + 
                   newInput.substring(modMatch.index + modMatch[0].length);
        }
        
        if (!modFound) {
          newInput = currentInput.substring(0, lastIndex) + 
                   `${modifier}${newCount}` + 
                   currentInput.substring(lastIndex);
        }
      }
      
      setInput(newInput);
    }
    else if (EXPLODING.includes(modifier)) {
      const escapedModifier = modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let explosionCount = 0;
      EXPLODING.forEach(mod => {
        const modRegex = new RegExp(`${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const substringToCheck = currentInput.substring(lastIndex);
        explosionCount += (substringToCheck.match(modRegex) || []).length;
      });
      
      if (modifier === '!' && explosionCount >= 2) return;
      if (modifier !== '!' && explosionCount >= 1) return;
      
      const modRegex = new RegExp(`${escapedModifier}`, 'g');
      if (modRegex.test(currentInput.substring(lastIndex))) {
        return;
      }
      
      const newInput = currentInput.substring(0, lastIndex) + 
                     modifier + 
                     currentInput.substring(lastIndex);
      setInput(newInput);
    }
    else if (REROLL.includes(modifier)) {
      const escapedModifier = modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let rerollCount = 0;
      REROLL.forEach(mod => {
        const modRegex = new RegExp(`${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const substringToCheck = currentInput.substring(lastIndex);
        rerollCount += (substringToCheck.match(modRegex) || []).length;
      });
      
      if (rerollCount >= 1) return;
      
      const newInput = currentInput.substring(0, lastIndex) + 
                     modifier + 
                     currentInput.substring(lastIndex);
      setInput(newInput);
    }
    else if (SUCCESS_FAILURE.includes(modifier)) {
      const currentCount = modifierCountsRef.current[modifier] || 0;
      const newCount = currentCount + 1;
      
      if (newCount > diceSize) {
        return;
      }
      
      const escapedModifier = modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const modRegex = new RegExp(`${escapedModifier}(?:=|<=|>=|<|>)?(\\d+)?`, 'g');
      let modMatch;
      let modFound = false;
      let newInput = currentInput;
      
      while ((modMatch = modRegex.exec(currentInput)) !== null) {
        modFound = true;
        newInput = newInput.substring(0, modMatch.index) + 
                  `${modifier}=${newCount}` + 
                  newInput.substring(modMatch.index + modMatch[0].length);
      }
      
      if (!modFound) {
        newInput = currentInput.substring(0, lastIndex) + 
                  `${modifier}=${newCount}` + 
                  currentInput.substring(lastIndex);
      }
      
      setInput(newInput);
    }
    else if (COMPARISON.includes(modifier)) {
      const escapedModifier = modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let comparisonFound = false;
      COMPARISON.forEach(comp => {
        const compRegex = new RegExp(`${comp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+`, 'g');
        if (compRegex.test(currentInput.substring(lastIndex))) {
          comparisonFound = true;
        }
      });
      
      let newInput = currentInput;
      
      if (comparisonFound) {
        COMPARISON.forEach(comp => {
          const escapedComp = comp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const compRegex = new RegExp(`${escapedComp}\\d+`, 'g');
          newInput = newInput.replace(compRegex, `${modifier}1`);
        });
      } else {
        newInput = currentInput.substring(0, lastIndex) + 
                 `${modifier}1` + 
                 currentInput.substring(lastIndex);
      }
      
      setInput(newInput);
    }
    else {
      const newInput = currentInput.substring(0, lastIndex) + 
                     modifier + 
                     currentInput.substring(lastIndex);
      setInput(newInput);
    }
  }, [setInput, isDisabled, modifierCountsRef]);

  const handleNumberClick = React.useCallback((number: number) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    if (currentInput === undefined) return;
    
    setInput(currentInput + number.toString());
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

  const [longPressTimer, setLongPressTimer] = React.useState<ReturnType<typeof setTimeout> | null>(null);
  const [longPressTarget, setLongPressTarget] = React.useState<number | null>(null);

  const handleTouchStart = React.useCallback((sides: number) => {
    if (isDisabled) return;
    
    const timer = setTimeout(() => {
      resetDiceCounts(sides);
      setLongPressTarget(sides);
    }, 500);
    
    setLongPressTimer(timer);
  }, [isDisabled, resetDiceCounts]);
  
  const resetModifierCount = React.useCallback((modifier: string) => {
    if (isDisabled) return;
    
    const currentInput = inputRef.current;
    if (!currentInput) return;
    
    const currentCounts = { ...modifierCountsRef.current };
    currentCounts[modifier] = 0;
    modifierCountsRef.current = currentCounts;
    
    let modRegex;
    if (modifier === 'd') {
      modRegex = new RegExp(`(\\d+d\\d+.*?)([^d]d\\d*)`, 'g');
    } else {
      modRegex = new RegExp(`${modifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d*`, 'g');
    }
    
    let newInput = currentInput;
    let match;
    while (match = modRegex.exec(currentInput)) {
      if (modifier === 'd') {
        newInput = newInput.replace(match[2], '');
      } else {
        newInput = newInput.replace(match[0], '');
      }
    }
    
    newInput = newInput.replace(/\+\+/g, '+').replace(/\-\+/g, '-').replace(/\+\-/g, '-');
    newInput = newInput.replace(/^\+/, '').replace(/\+$/, '').replace(/\-$/, '');
    
    setInput(newInput);
  }, [setInput, isDisabled]);

  const handleModifierTouchStart = React.useCallback((modifier: string) => {
    if (isDisabled) return;
    
    const timer = setTimeout(() => {
      resetModifierCount(modifier);
      setLongPressModifier(modifier);
    }, 500);
    
    setLongPressTimer(timer);
  }, [isDisabled, resetModifierCount]);

  const handleTouchEnd = React.useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setLongPressTarget(null);
    setLongPressModifier(null);
  }, [longPressTimer]);

  const diceButtons = React.useMemo(() => (
    <div className="flex flex-wrap gap-2 justify-center mb-2">
      {DICE_TYPES.map((sides) => {
        const count = diceCounts[sides] || 0;
        return (
          <div key={`dice-${sides}`} className="flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateDiceCount(sides)}
                    disabled={isDisabled}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      resetDiceCounts(sides);
                    }}
                    onTouchStart={() => handleTouchStart(sides)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className={cn(
                      "h-10 w-10 sm:h-12 sm:w-12 flex flex-col items-center justify-center p-0",
                      longPressTarget === sides && "bg-red-100"
                    )}
                  >
                    {getDieIcon(sides)}
                    <span className="text-xs mt-0.5">d{sides === 100 ? '%' : sides}</span>
                  </Button>
                  {count > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center bg-[#ff00ff] text-white text-xs font-bold rounded-full shadow-md">
                      {count}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Click to add d{sides === 100 ? '%' : sides}</p>
                <p className="text-xs text-muted-foreground">Right-click or long-press to reset</p>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  ), [getDieIcon, isDisabled, updateDiceCount, resetDiceCounts, diceCounts, handleTouchStart, handleTouchEnd, longPressTarget]);

  const renderMobileLayout = React.useMemo(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return null;
    
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
                      onClick={() => updateDiceCount(sides)}
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
              disabled={isDisabled || !diceState.canAddOperator}
              className={cn(
                "h-9",
                !diceState.canAddOperator && "opacity-50"
              )}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModifierClick('k')}
                disabled={isDisabled || !diceState.canAddModifier}
                className={cn(
                  "h-full",
                  !diceState.canAddModifier && "opacity-50"
                )}
              >
                keep
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModifierClick('!')}
                disabled={isDisabled || !diceState.canAddModifier}
                className={cn(
                  "h-full",
                  !diceState.canAddModifier && "opacity-50"
                )}
              >
                !
              </Button>
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
                  disabled={isDisabled || !diceState.canAddModifier}
                  className={cn(
                    "h-9 w-full",
                    !diceState.canAddModifier && "opacity-50"
                  )}
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
          {EXPLODING.filter(m => m !== '!').concat(REROLL).map((mod) => (
            <Button
              key={`mod-mobile-${mod}`}
              variant="outline"
              size="sm"
              onClick={() => handleModifierClick(mod)}
              disabled={isDisabled || !diceState.canAddModifier}
              className={cn(
                "h-9",
                !diceState.canAddModifier && "opacity-50"
              )}
            >
              {mod}
            </Button>
          ))}
        </div>
        
        <div className="grid grid-cols-4 gap-1 mt-1">
          {SUCCESS_FAILURE.concat([COMPARISON[0], COMPARISON[2]]).map((mod) => {
            const count = SUCCESS_FAILURE.includes(mod) ? (modifierCounts[mod] || 0) : 0;
            return (
              <div key={`mod-mobile-${mod}`} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled || !diceState.canAddModifier}
                  className={cn(
                    "h-9 w-full",
                    !diceState.canAddModifier && "opacity-50"
                  )}
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
  }, [COMPARISON, EXPLODING, KEEP_DROP, OPERATORS, REROLL, SUCCESS_FAILURE, diceState.canAddModifier, diceState.canAddOperator, diceCounts, modifierCounts, handleModifierClick, handleNumberClick, handleOperatorClick, handleTouchEnd, handleTouchStart, isDisabled, longPressTarget, updateDiceCount]);

  const renderDesktopLayout = React.useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return null;
    
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
                      onClick={() => updateDiceCount(sides)}
                      disabled={isDisabled}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        resetDiceCounts(sides);
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
                  disabled={isDisabled || !diceState.canAddOperator}
                  className={cn(
                    "h-10",
                    !diceState.canAddOperator && "opacity-50"
                  )}
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
                      disabled={isDisabled || !diceState.canAddModifier}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        resetModifierCount(mod);
                      }}
                      onTouchStart={() => handleModifierTouchStart(mod)}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      className={cn(
                        "h-10 w-full",
                        !diceState.canAddModifier && "opacity-50",
                        longPressModifier === mod && "bg-red-100"
                      )}
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
                  <p className="text-xs text-muted-foreground">Right-click or long-press to reset</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[...EXPLODING, ...REROLL.slice(0, 1)].map((mod) => (
            <Tooltip key={`mod-desktop-${mod}`}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModifierClick(mod)}
                  disabled={isDisabled || !diceState.canAddModifier}
                  className={cn(
                    "h-10",
                    !diceState.canAddModifier && "opacity-50"
                  )}
                >
                  {mod}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {mod === '!' ? 'Exploding' : 
                   mod === '!!' ? 'Compounding' : 
                   mod === '!p' ? 'Penetrating' :
                   'Reroll once'}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[...SUCCESS_FAILURE, REROLL[1], COMPARISON[0]].map((mod) => {
            const count = SUCCESS_FAILURE.includes(mod) ? (modifierCounts[mod] || 0) : 0;
            return (
              <Tooltip key={`mod-desktop-${mod}`}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifierClick(mod)}
                      disabled={isDisabled || !diceState.canAddModifier}
                      onContextMenu={SUCCESS_FAILURE.includes(mod) ? (e) => {
                        e.preventDefault();
                        resetModifierCount(mod);
                      } : undefined}
                      onTouchStart={SUCCESS_FAILURE.includes(mod) ? () => handleModifierTouchStart(mod) : undefined}
                      onTouchEnd={SUCCESS_FAILURE.includes(mod) ? handleTouchEnd : undefined}
                      onTouchCancel={SUCCESS_FAILURE.includes(mod) ? handleTouchEnd : undefined}
                      className={cn(
                        "h-10 w-full",
                        !diceState.canAddModifier && "opacity-50",
                        longPressModifier === mod && "bg-red-100"
                      )}
                    >
                      {mod}
                    </Button>
                    {SUCCESS_FAILURE.includes(mod) && count > 0 && (
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
                     'Equal to'}
                  </p>
                  {SUCCESS_FAILURE.includes(mod) && <p className="text-xs text-muted-foreground">Right-click or long-press to reset</p>}
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
                  disabled={isDisabled || !diceState.canAddComparison}
                  className={cn(
                    "h-10",
                    !diceState.canAddComparison && "opacity-50"
                  )}
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
  }, [COMPARISON, DICE_TYPES, EXPLODING, KEEP_DROP, OPERATORS, REROLL, SUCCESS_FAILURE, diceCounts, modifierCounts, diceState.canAddComparison, diceState.canAddModifier, diceState.canAddOperator, getDieIcon, handleModifierClick, handleModifierTouchStart, handleNumberClick, handleOperatorClick, handleTouchEnd, isDisabled, longPressModifier, longPressTarget, resetDiceCounts, resetModifierCount, updateDiceCount]);

  React.useEffect(() => {
    const handleSelectionChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement) {
        setSelectionStart(e.target.selectionStart);
        setSelectionEnd(e.target.selectionEnd);
      }
    };
    
    window.addEventListener('diceInputSelectionChange', handleSelectionChange as EventListener);
    
    return () => {
      window.removeEventListener('diceInputSelectionChange', handleSelectionChange as EventListener);
    };
  }, []);

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