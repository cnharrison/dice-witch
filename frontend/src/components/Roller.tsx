import { D10Icon, D12Icon, D20Icon, D4Icon, D6Icon, D8Icon } from "@/components/icons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type DiceInfo } from "@/hooks/useDiceValidation";
import * as React from "react";
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
}

export function Roller({ diceInfo }: RollerProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-[500px] rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full flex-col p-6">
          <div className="flex flex-wrap gap-4 justify-center">
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
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Results Panel</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}