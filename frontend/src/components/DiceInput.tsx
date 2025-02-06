import { Input } from "@/components/ui/input"

export function DiceInput() {
  return (
    <div className="w-full mt-4">
      <Input
        type="text"
        placeholder="Enter dice roll (e.g., 2d20+5)"
        className="w-full"
      />
    </div>
  )
}