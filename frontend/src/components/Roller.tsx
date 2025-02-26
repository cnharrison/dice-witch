import { D10Icon, D12Icon, D20Icon, D4Icon, D6Icon, D8Icon } from "@/components/icons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type DiceInfo } from "@/hooks/useDiceValidation";
import { RollResponse } from "@/types/dice";
import * as React from "react";
import { DiceAnimation3D } from "./DiceAnimation3D";

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
}

export function Roller({ diceInfo, rollResults, isRolling }: RollerProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-[500px] rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-6 relative">
          <div className="flex flex-wrap gap-4 justify-center z-10 relative">
            {diceInfo?.diceGroups.map((group, index) => {
              const DiceIcon = DiceIcons[`d${group.diceSize}` as keyof typeof DiceIcons];
              if (!DiceIcon) return null;

              return (
                <div key={index} className="flex flex-col items-center">
                  <DiceIcon className="w-16 h-16" />
                  <span className="text-sm font-medium mt-1">×{group.numberOfDice}</span>
                </div>
              );
            })}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full flex-col items-center justify-center p-6 relative">
          {isRolling && (
            <div className="absolute inset-0">
              <DiceAnimation3D diceInfo={diceInfo} />
            </div>
          )}
          {rollResults ? (
            <div className="w-full flex flex-col items-center z-10 relative">
              <div className="flex flex-col items-center mb-6">
                <div className="text-3xl font-extrabold">
                  {rollResults.resultArray.map(result => result.results).reduce((a, b) => a + b, 0)}
                </div>
              </div>
              
              {rollResults.imageData ? (
                <div className="flex justify-center mb-4">
                  <img 
                    src={`data:image/webp;base64,${rollResults.imageData}`}
                    alt="Dice roll result"
                    className="max-w-full rounded-lg shadow-md"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 justify-center mb-4">
                  {rollResults.diceArray.flat().map((die, index) => {
                    const DiceIcon = DiceIcons[`d${die.sides}` as keyof typeof DiceIcons];
                    if (!DiceIcon) return null;

                    return (
                      <div 
                        key={index} 
                        className="flex flex-col items-center p-3 border rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${die.color}, ${die.secondaryColor})`,
                          color: die.textColor,
                        }}
                      >
                        <DiceIcon className="w-12 h-12" />
                        <span className="text-xl font-bold mt-1">{die.rolled}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {rollResults.resultArray.map((result, index) => (
                <div key={index} className="text-center text-lg font-medium">
                  {result.output}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}