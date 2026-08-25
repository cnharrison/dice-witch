import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Trash2 } from "lucide-react";
import * as React from "react";

type SavedAppearanceDesign = Readonly<{
  id: string;
  name: string;
  pendingDeletion: boolean;
  basedOnStyle?: string;
  recipe: Readonly<{ variation: string; varyBy: string }>;
}>;

type SavedAppearanceDesignsProps = {
  id: string;
  designs: readonly SavedAppearanceDesign[];
  expanded: boolean;
  editingDesignId: string | null;
  isSaving: boolean;
  canCreate: boolean;
  canDuplicate: boolean;
  maximumNameLength: number;
  onCreate(): void;
  onToggle(): void;
  onApply?: (designId: string) => void;
  onEdit(designId: string): void;
  onNameChange(designId: string, name: string): void;
  onDoneEditing(): void;
  onDuplicate(designId: string): void;
  onDelete(designId: string): void;
  onRestore(designId: string): void;
};

export function SavedAppearanceDesigns({
  id,
  designs,
  expanded,
  editingDesignId,
  isSaving,
  canCreate,
  canDuplicate,
  maximumNameLength,
  onCreate,
  onToggle,
  onApply,
  onEdit,
  onNameChange,
  onDoneEditing,
  onDuplicate,
  onDelete,
  onRestore,
}: SavedAppearanceDesignsProps) {
  const storedCount = designs.filter(
    ({ pendingDeletion }) => !pendingDeletion,
  ).length;
  const visibleDesigns = editingDesignId === null
    ? designs
    : designs.filter(({ id: designId }) => designId === editingDesignId);
  const editButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const focusAfterEditingId = React.useRef<string | null>(null);

  React.useEffect(() => {
    const designId = focusAfterEditingId.current;
    if (editingDesignId !== null || designId === null) return;
    editButtons.current.get(designId)?.focus();
    focusAfterEditingId.current = null;
  }, [editingDesignId]);

  return (
    <div className="appearance-editor-saved-card rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Saved designs</h2>
          <p className="text-xs text-muted-foreground">
            {storedCount} of 10 used
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving || !canCreate}
          onClick={onCreate}
        >
          New design
        </Button>
      </div>
      {designs.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full xl:hidden"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? "Hide saved designs" : "Saved designs"}
          <span className="sr-only">, {designs.length} total</span>
        </Button>
      )}
      <div
        id={id}
        className={designs.length === 0 || expanded ? "" : "hidden xl:block"}
      >
        {designs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No saved designs.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visibleDesigns.map((design) => (
              <li
                key={design.id}
                className="rounded-md border bg-background p-2"
              >
                {editingDesignId === design.id && !design.pendingDeletion ? (
                  <form
                    className="appearance-saved-design-editor space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      focusAfterEditingId.current = design.id;
                      onDoneEditing();
                    }}
                  >
                    {design.basedOnStyle !== undefined && (
                      <p className="text-xs font-medium text-muted-foreground">
                        Based on {design.basedOnStyle}
                      </p>
                    )}
                    <label className="sr-only" htmlFor={`${id}-${design.id}-name`}>
                      Custom design name
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`${id}-${design.id}-name`}
                        autoFocus
                        value={design.name}
                        maxLength={maximumNameLength}
                        disabled={isSaving}
                        onChange={(event) =>
                          onNameChange(design.id, event.target.value)
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        aria-label="Duplicate"
                        disabled={isSaving || !canDuplicate}
                        onClick={() => onDuplicate(design.id)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="submit" size="sm" disabled={isSaving}>
                        Done
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      ref={(button) => {
                        if (button === null) {
                          editButtons.current.delete(design.id);
                        } else {
                          editButtons.current.set(design.id, button);
                        }
                      }}
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
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
