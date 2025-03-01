import * as React from 'react';
import { Roller } from '@/components/Roller';
import { DiceInput } from '@/components/DiceInput';
import { useDiceValidation } from '@/hooks/useDiceValidation';
import { RollResponse } from '@/types/dice';
import { DiceRoll } from '@dice-roller/rpg-dice-roller';

import { ThemeProvider } from '@/components/theme-provider';

export function PreviewRoller() {
  const { input, setInput, isValid, diceInfo } = useDiceValidation('');
  const [isRolling, setIsRolling] = React.useState(false);
  const [rollResults, setRollResults] = React.useState<RollResponse | null>(null);
  const [showAnimation, setShowAnimation] = React.useState(false);
  const [timesToRepeat, setTimesToRepeat] = React.useState<number>(1);
  const [rollTitle, setRollTitle] = React.useState<string>('');

  React.useEffect(() => {
    if (!input) {
      setIsRolling(false);
      setRollResults(null);
      setShowAnimation(false);
    } else {
      setShowAnimation(isValid);
    }
  }, [input, isValid]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!value) {
      setIsRolling(false);
      setRollResults(null);
      setShowAnimation(false);
    }
  };

  const getDiceColor = (sides: number): { color: string, secondaryColor: string, textColor: string } => {
    switch (sides) {
      case 4:
        return { color: '#05b2dc', secondaryColor: '#0292b2', textColor: '#000000' };
      case 6:
        return { color: '#222222', secondaryColor: '#000000', textColor: '#ffffff' };
      case 8:
        return { color: '#5e1d8c', secondaryColor: '#3d0066', textColor: '#ffffff' };
      case 10:
        return { color: '#00cc66', secondaryColor: '#009933', textColor: '#000000' };
      case 12:
        return { color: '#1a1a2e', secondaryColor: '#080830', textColor: '#ffffff' };
      case 20:
        return { color: '#e60049', secondaryColor: '#c10040', textColor: '#ffffff' };
      case 100:
        return { color: '#434343', secondaryColor: '#000000', textColor: '#ffffff' };
      default:
        return { color: '#4c4c4c', secondaryColor: '#222222', textColor: '#ffffff' };
    }
  };

  const rollDiceLocally = () => {
    if (!isValid || !input) return;

    try {
      setIsRolling(true);
      setShowAnimation(true);
      setRollResults(null);

      setTimeout(() => {
        try {
          const roll = new DiceRoll(input);
          
          const resultArray = [{
            output: roll.output,
            results: roll.total || 0
          }];
          
          const diceArray: any[][] = [];
          
          if (diceInfo) {
            diceInfo.diceGroups.forEach(group => {
              const diceOfType = [];
              
              for (let i = 0; i < group.numberOfDice; i++) {
                const diceColors = getDiceColor(group.diceSize);
                let result;
                
                try {
                  const outputMatch = roll.output.match(/\[([^\]]+)\]/g);
                  
                  if (outputMatch) {
                    if (!window.diceValues) {
                      window.diceValues = {};
                      const dicePatterns = input.match(/\b(\d+)d(\d+|\%)/g) || [];
                      let currentDiceTypeIndex = 0;
                      
                      dicePatterns.forEach(pattern => {
                        const [count, size] = pattern.split('d');
                        const diceSize = size === '%' ? 100 : parseInt(size);
                        
                        if (currentDiceTypeIndex >= outputMatch.length) return;
                        
                        const valuesStr = outputMatch[currentDiceTypeIndex]
                          .replace(/[\[\]]/g, '')
                          .replace(/d$/, '')
                          .split(',')
                          .map(s => s.trim());
                        
                        window.diceValues[diceSize] = valuesStr.map(v => parseInt(v));
                        currentDiceTypeIndex++;
                      });
                    }
                    
                    if (window.diceValues && window.diceValues[group.diceSize] && 
                        window.diceValues[group.diceSize][i] !== undefined) {
                      result = window.diceValues[group.diceSize][i];
                    } else {
                      result = Math.floor(Math.random() * group.diceSize) + 1;
                    }
                  } else {
                    result = Math.floor(Math.random() * group.diceSize) + 1;
                  }
                } catch (error) {
                  result = Math.floor(Math.random() * group.diceSize) + 1;
                }
                
                diceOfType.push({
                  sides: group.diceSize,
                  rolled: result,
                  color: diceColors.color,
                  secondaryColor: diceColors.secondaryColor,
                  textColor: diceColors.textColor,
                  value: result
                });
              }
              
              if (diceOfType.length > 0) {
                diceArray.push(diceOfType);
              }
            });
          }
          
          window.diceValues = undefined;
          
          setRollResults({
            resultArray,
            diceArray
          });
        } catch (error) {
          setRollResults({
            resultArray: [{ output: 'Error rolling dice', results: 0 }],
            diceArray: []
          });
        }
        
        setIsRolling(false);
      }, 1000);
      
    } catch (error) {
      setIsRolling(false);
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="preview-theme">
      <div className="flex flex-col items-center">
        <div className="w-full 
                        [&_button:not([variant=ghost]):not([size=icon])]:!bg-[#8000ff] 
                        [&_button:not([variant=ghost]):not([size=icon])]:!text-white 
                        [&_button:not([variant=ghost]):not([size=icon])]:hover:!bg-[#6600cc]
                        
                        [&_button[variant=ghost]]:!bg-transparent 
                        [&_button[variant=ghost]]:!text-[#9933ff]
                        [&_button[variant=ghost]]:hover:!text-[#aa66ff]
                        
                        [&_button[size=icon]]:!bg-transparent 
                        [&_button[size=icon]]:!text-[#9933ff]
                        [&_button[size=icon]]:hover:!text-[#aa66ff]
                        
                        [&_input]:!bg-[#050505] 
                        [&_input]:!border-[#333333] 
                        [&_input]:!text-[#ffffff]
                        
                        [&_.d20-icon]:!text-[#9933ff]">
          <Roller
            diceInfo={diceInfo}
            rollResults={rollResults}
            isRolling={isRolling}
            showAnimation={showAnimation || isRolling}
            input={input}
            setInput={handleInputChange}
            selectedChannel={true}
          />
          <div className="dice-input-container">
            <DiceInput
              input={input}
              setInput={handleInputChange}
              isValid={isValid}
              onRoll={rollDiceLocally}
              timesToRepeat={timesToRepeat}
              onTimesToRepeatChange={setTimesToRepeat}
              selectedChannel={true}
              rollTitle={rollTitle}
              onRollTitleChange={setRollTitle}
            />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}