import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";

type SavedAppearanceDesign = Readonly<{
  id: string;
  name: string;
  pendingDeletion: boolean;
  recipe: Readonly<{ variation: string; varyBy: string }>;
}>;

type SavedAppearanceDesignsProps = {
  designs: readonly SavedAppearanceDesign[];
  isSaving: boolean;
  canDuplicate: boolean;
  onApply?: (designId: string) => void;
  onEdit(designId: string): void;
  onDuplicate(designId: string): void;
  onDelete(designId: string): void;
  onRestore(designId: string): void;
};

export function SavedAppearanceDesigns({
  designs,
  isSaving,
  canDuplicate,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onRestore,
}: SavedAppearanceDesignsProps) {
  const storedCount = designs.filter(
    ({ pendingDeletion }) => !pendingDeletion,
  ).length;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">Saved designs</h2>
      <p className="text-xs text-muted-foreground">
        {storedCount} of 10 used
      </p>
      {designs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No saved designs.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {designs.map((design) => (
            <li
              key={design.id}
              className="flex items-center gap-2 rounded-md border bg-background p-2"
            >
              <button
                type="button"
                aria-label={`Edit ${design.name}`}
                disabled={isSaving || design.pendingDeletion}
                onClick={() => onEdit(design.id)}
                className="min-w-0 flex-1 rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span
                  className={`block truncate text-sm font-medium ${
                    design.pendingDeletion ? "line-through" : ""
                  }`}
                >
                  {design.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {design.recipe.variation} · {design.recipe.varyBy}
                </span>
              </button>
              {design.pendingDeletion ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-9"
                  aria-label={`Undo deleting ${design.name}`}
                  disabled={isSaving}
                  onClick={() => onRestore(design.id)}
                >
                  Undo
                </Button>
              ) : (
                <>
                  {onApply !== undefined && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 sm:h-9"
                      aria-label={`Use ${design.name}`}
                      disabled={isSaving}
                      onClick={() => onApply(design.id)}
                    >
                      Use
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 sm:h-10 sm:w-10"
                    aria-label={`Duplicate ${design.name}`}
                    disabled={isSaving || !canDuplicate}
                    onClick={() => onDuplicate(design.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 sm:h-10 sm:w-10"
                    aria-label={`Delete ${design.name}`}
                    disabled={isSaving}
                    onClick={() => onDelete(design.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
