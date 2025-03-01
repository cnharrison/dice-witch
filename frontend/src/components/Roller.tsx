import { D10Icon, D12Icon, D20Icon, D4Icon, D6Icon, D8Icon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type DiceInfo } from "@/hooks/useDiceValidation";
import { RollResponse } from "@/types/dice";
import * as React from "react";
import { DiceAnimation3D } from "./DiceAnimation3D";
import { DiceNotationButtons } from "./DiceNotationButtons";

const DiceIcons = {
  d4: D4Icon,
  d6: D6Icon,
  d8: D8Icon,
  d10: D10Icon,
  d12: D12Icon,
  d20: D20Icon,
} as const;

interface RollerProps {
  diceInfo: DiceInfo | null;
  rollResults: RollResponse | null;
  isRolling: boolean;
  showAnimation?: boolean;
  input: string;
  setInput: (value: string) => void;
  selectedChannel: boolean;
}

export function Roller({ 
  diceInfo, 
  rollResults, 
  isRolling, 
  showAnimation = false,
  input,
  setInput,
  selectedChannel
}: RollerProps) {
  const previousDiceInfoRef = React.useRef<DiceInfo | null>(null);
  const combinedDiceInfoRef = React.useRef<DiceInfo | null>(null);
  const [combinedDiceInfo, setCombinedDiceInfo] = React.useState<DiceInfo | null>(null);
  const [diceToRemove, setDiceToRemove] = React.useState<{diceSize: number, count: number}[]>([]);
  const { theme } = useTheme();

  React.useEffect(() => {
    if (!diceInfo) {
      if (previousDiceInfoRef.current) {
        const allDiceToRemove = previousDiceInfoRef.current.diceGroups.map(group => ({
          diceSize: group.diceSize,
          count: group.numberOfDice
        }));
        setDiceToRemove(allDiceToRemove);
      }

      setTimeout(() => {
        previousDiceInfoRef.current = null;
        combinedDiceInfoRef.current = null;
        setCombinedDiceInfo(null);
        setDiceToRemove([]);
      }, 1000);

      return;
    }

    if (previousDiceInfoRef.current) {
      const diceSizeToRemove: {diceSize: number, count: number}[] = [];

      previousDiceInfoRef.current.diceGroups.forEach(prevGroup => {
        const newGroup = diceInfo.diceGroups.find(g => g.diceSize === prevGroup.diceSize);

        if (!newGroup) {
          diceSizeToRemove.push({
            diceSize: prevGroup.diceSize,
            count: prevGroup.numberOfDice
          });
        } else if (newGroup.numberOfDice < prevGroup.numberOfDice) {
          diceSizeToRemove.push({
            diceSize: prevGroup.diceSize,
            count: prevGroup.numberOfDice - newGroup.numberOfDice
          });
        }
      });

      setDiceToRemove(diceSizeToRemove);

      const existingGroups = [...previousDiceInfoRef.current.diceGroups];

      diceInfo.diceGroups.forEach(newGroup => {
        const existingGroupIndex = existingGroups.findIndex(g => g.diceSize === newGroup.diceSize);

        if (existingGroupIndex >= 0) {
          existingGroups[existingGroupIndex].numberOfDice = newGroup.numberOfDice;
        } else {
          existingGroups.push(newGroup);
        }
      });

      const filteredGroups = existingGroups.filter(group => group.numberOfDice > 0);

      const combined = {
        diceGroups: filteredGroups,
        modifier: diceInfo.modifier
      };

      combinedDiceInfoRef.current = combined;
      setCombinedDiceInfo(combined);
    } else {
      previousDiceInfoRef.current = diceInfo;
      combinedDiceInfoRef.current = diceInfo;
      setCombinedDiceInfo(diceInfo);
    }

    previousDiceInfoRef.current = { ...diceInfo };

    setTimeout(() => {
      setDiceToRemove([]);
    }, 1000);
  }, [diceInfo]);

  const renderRollResults = () => {
    if (!rollResults) return null;

    return (
      <div className="w-full flex flex-col items-center absolute top-6 left-0 right-0 z-[20]">
        <div className="flex flex-col items-center">
          <div className="text-5xl sm:text-7xl font-extrabold text-white [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000,0_0_12px_rgba(0,0,0,0.8)]">
            {rollResults.resultArray && rollResults.resultArray.length > 0 && rollResults.resultArray[0].results !== undefined
              ? rollResults.resultArray[0].results
              : 'Error'}
          </div>
          <div className="mt-2 text-base sm:text-xl text-white [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000,0_0_8px_rgba(0,0,0,0.8)]">
            {rollResults.resultArray && rollResults.resultArray.length > 0
              ? rollResults.resultArray.map((result, i) => (
                  <span key={i} className="mx-1">
                    {i > 0 ? ' + ' : ''}
                    {result.output}
                  </span>
                ))
              : rollResults.message || 'Invalid notation'}
          </div>
        </div>

        {!rollResults.imageData && rollResults.diceArray && rollResults.diceArray.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:gap-4 justify-center mb-4">
            {rollResults.diceArray.flat().map((die, index) => {
              const DiceIcon = DiceIcons[`d${die.sides}` as keyof typeof DiceIcons];

              return (
                <div
                  key={index}
                  className="flex flex-col items-center p-2 sm:p-3 border rounded-lg relative z-[999] pointer-events-auto"
                  style={{
                    background: `linear-gradient(135deg, ${die.color}, ${die.secondaryColor})`,
                    color: die.textColor
                  }}
                >
                  <div className="text-base sm:text-xl font-bold mb-1">{die.value}</div>
                  {DiceIcon ? (
                    <DiceIcon className="w-6 h-6 sm:w-8 sm:h-8" darkMode={theme === 'dark'} />
                  ) : (
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs font-bold">
                      d{die.sides}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const render3DDice = () => {
    if (!showAnimation || !combinedDiceInfo) return null;

    return (
      <div className="absolute inset-0 z-[1]">
        <DiceAnimation3D
          key="persistent-dice-animation"
          diceInfo={combinedDiceInfo}
          diceToRemove={diceToRemove}
          diceColors={rollResults?.diceArray?.flat()?.reduce((colors, die) => {
            colors[die.sides] = die.color;
            return colors;
          }, {} as Record<number, string>)}
          className="h-full w-full"
        />
      </div>
    );
  };

  const renderImageData = () => {
    if (!rollResults || !rollResults.imageData) return null;

    return (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]"
      >
        <div className="pointer-events-auto">
          <img
            src={`data:image/webp;base64,${rollResults.imageData}`}
            alt="Dice roll result"
            className="max-w-full p-4"
          />
        </div>
      </div>
    );
  };

  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 640;

  if (isMobileView) {
    return (
      <div className="flex flex-col min-h-[500px] h-[90vh] rounded-lg border">
        <div className="h-[45%] relative isolate">
          {showAnimation && combinedDiceInfo && (
            <div className="absolute inset-0 z-[1]">
              <DiceAnimation3D
                key="persistent-dice-animation"
                diceInfo={combinedDiceInfo}
                diceToRemove={diceToRemove}
                diceColors={rollResults?.diceArray?.flat()?.reduce((colors, die) => {
                  colors[die.sides] = die.color;
                  return colors;
                }, {} as Record<number, string>)}
                className="h-full w-full"
              />
            </div>
          )}

          {rollResults && rollResults.imageData && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]"
            >
              <div className="pointer-events-auto">
                <img
                  src={`data:image/webp;base64,${rollResults.imageData}`}
                  alt="Dice roll result"
                  className="max-w-full p-4"
                />
              </div>
            </div>
          )}

          {rollResults && (
            <div className="w-full flex flex-col items-center absolute top-4 left-0 right-0 z-[20]">
              <div className="flex flex-col items-center">
                <div className="text-4xl font-extrabold text-white [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000,0_0_12px_rgba(0,0,0,0.8)]">
                  {rollResults.resultArray && rollResults.resultArray.length > 0 && rollResults.resultArray[0].results !== undefined
                    ? rollResults.resultArray[0].results
                    : 'Error'}
                </div>
                <div className="mt-1 text-sm text-white [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000,0_0_8px_rgba(0,0,0,0.8)]">
                  {rollResults.resultArray && rollResults.resultArray.length > 0
                    ? rollResults.resultArray.map((result, i) => (
                        <span key={i} className="mx-1">
                          {i > 0 ? ' + ' : ''}
                          {result.output}
                        </span>
                      ))
                    : rollResults.message || 'Invalid notation'}
                </div>
              </div>

              {!rollResults.imageData && rollResults.diceArray && rollResults.diceArray.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mb-2">
                  {rollResults.diceArray.flat().map((die, index) => {
                    const DiceIcon = DiceIcons[`d${die.sides}` as keyof typeof DiceIcons];

                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center p-1 border rounded-lg relative z-[999] pointer-events-auto"
                        style={{
                          background: `linear-gradient(135deg, ${die.color}, ${die.secondaryColor})`,
                          color: die.textColor
                        }}
                      >
                        <div className="text-sm font-bold mb-0.5">{die.value}</div>
                        {DiceIcon ? (
                          <DiceIcon className="w-5 h-5" darkMode={theme === 'dark'} />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs font-bold">
                            d{die.sides}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-[55%] p-2 border-t overflow-y-auto">
          <DiceNotationButtons 
            input={input}
            setInput={setInput}
            isDisabled={!selectedChannel}
          />
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-[600px] h-[70vh] rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full flex-col items-center justify-center p-6 overflow-auto">
          <DiceNotationButtons 
            input={input}
            setInput={setInput}
            isDisabled={!selectedChannel}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div
          className="flex h-full flex-col items-center justify-center p-6 relative isolate"
        >
          {render3DDice()}
          {renderImageData()}
          {renderRollResults()}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}