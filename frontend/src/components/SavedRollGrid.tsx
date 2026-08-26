import { Badge } from "@/components/ui/badge";
import { LibraryRollName } from "@/components/LibraryRollName";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBrowserMediaQueryV4 } from "@/components/dice-v4-3d/browser-media";
import { cn } from "@/lib/utils";
import type {
  SavedRoll,
  SavedRollSearchEntry,
  SavedRollSearchSort,
} from "@/lib/saved-rolls";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  GripVertical,
  Info,
  Trash2,
} from "lucide-react";
import * as React from "react";

const MOBILE_GRID_QUERY = "(max-width: 767px)";
const COMPACT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const EXACT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long",
});

type LibraryRow = {
  savedRoll: SavedRoll;
  listRevision: number;
  source: SavedRollSearchEntry["source"];
  canManage: boolean;
};

type GridRow = LibraryRow & { order: number };

type SavedRollGridProps = {
  rows: readonly LibraryRow[];
  searchMode: boolean;
  searchSort: { column: SavedRollSearchSort; direction: "asc" | "desc" };
  canReorder: boolean;
  pending: boolean;
  selectedIds: ReadonlySet<string>;
  onSelectionChange(ids: ReadonlySet<string>): void;
  onSearchSortChange(sort: {
    column: SavedRollSearchSort;
    direction: "asc" | "desc";
  }): void;
  onEdit(row: LibraryRow): void;
  onDelete(row: LibraryRow): void;
  onReorder(orderedIds: readonly string[]): void;
};

function DateValue({ timestamp }: { timestamp: number }) {
  const exact = EXACT_DATE_FORMATTER.format(timestamp);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={new Date(timestamp).toISOString()}
          tabIndex={0}
          aria-label={exact}
        >
          {COMPACT_DATE_FORMATTER.format(timestamp)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  );
}

function SourceBadge({ source }: { source: LibraryRow["source"] }) {
  if (source.type === "personal") return null;
  return (
    <Badge
      variant="secondary"
      className="max-w-32 truncate align-middle sm:max-w-44"
      title={source.guildName}
    >
      {source.guildName}
    </Badge>
  );
}

function RollDetails({ savedRoll }: { savedRoll: SavedRoll }) {
  return (
    <div className="min-w-0">
      <p className="break-all font-mono text-sm">{savedRoll.notation}</p>
      {(savedRoll.title !== null || savedRoll.repetitions > 1) && (
        <p className="truncate text-xs text-muted-foreground">
          {[
            savedRoll.title,
            savedRoll.repetitions > 1
              ? `Repeat ×${String(savedRoll.repetitions)}`
              : null,
          ]
            .filter((value) => value !== null)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function RowActions({
  row,
  pending,
  onEdit,
  onDelete,
}: {
  row: LibraryRow;
  pending: boolean;
  onEdit(): void;
  onDelete(): void;
}) {
  return (
    <div
      className="flex flex-wrap justify-end gap-1"
      data-no-drag
      data-no-select
    >
      {row.canManage && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={onEdit}>
          Edit
        </Button>
      )}
      {row.canManage && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          aria-label={`Delete ${row.savedRoll.displayName}`}
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function ariaSort(
  direction: false | "asc" | "desc",
): "ascending" | "descending" | undefined {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return undefined;
}

function SortHeader({
  label,
  sorted,
  direction,
  onClick,
}: {
  label: string;
  sorted: boolean;
  direction: "asc" | "desc";
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center gap-1 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      {label}
      {sorted ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

function SelectionCheckbox({
  ariaLabel,
  selected,
  indeterminate = false,
  onChange,
}: {
  ariaLabel: string;
  selected: boolean;
  indeterminate?: boolean;
  onChange(checked: boolean): void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (inputRef.current !== null) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label
      className="inline-flex cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      data-no-select
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={selected}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-brand/60 bg-background text-transparent shadow-sm transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-indeterminate:border-brand peer-indeterminate:bg-brand peer-indeterminate:text-brand-foreground peer-hover:border-brand"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    </label>
  );
}

function OrderHelp({
  manualOrder,
  onRestore,
}: {
  manualOrder: boolean;
  onRestore(): void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {!manualOrder && (
        <Button type="button" size="sm" variant="outline" onClick={onRestore}>
          <GripVertical className="h-4 w-4" aria-hidden="true" />
          Use library order
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-brand"
            aria-label="About library order"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Drag rolls to reorder them. Discord uses the same order.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function DragHandle({
  name,
  attributes,
  listeners,
  disabled,
}: {
  name: string;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  disabled: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="touch-none"
      aria-label={`Move ${name}`}
      data-no-select
      disabled={disabled}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

function DraggableTableRow({
  row,
  reorderEnabled,
  showHandle,
  pending,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  row: Row<GridRow>;
  reorderEnabled: boolean;
  showHandle: boolean;
  pending: boolean;
  selected: boolean;
  onSelect(checked: boolean): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const sortable = useSortable({
    id: row.original.savedRoll.id,
    disabled: !reorderEnabled || pending,
  });
  return (
    <tr
      ref={sortable.setNodeRef}
      className={cn(
        "border-b last:border-b-0",
        selected && "bg-accent/70 ring-1 ring-inset ring-ring",
      )}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.7 : 1,
        position: "relative",
        zIndex: sortable.isDragging ? 1 : 0,
      }}
    >
      <td className="w-12 px-2 py-2 text-center" data-no-select>
        <SelectionCheckbox
          ariaLabel={`Select ${row.original.savedRoll.displayName}`}
          selected={selected}
          onChange={onSelect}
        />
      </td>
      {showHandle && (
        <td className="w-12 px-2 py-2">
          <DragHandle
            name={row.original.savedRoll.displayName}
            attributes={sortable.attributes}
            listeners={sortable.listeners}
            disabled={!reorderEnabled || pending}
          />
        </td>
      )}
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className={cn(
            "px-3 py-3 align-middle",
            (cell.column.id === "created" || cell.column.id === "updated") &&
              "whitespace-nowrap",
          )}
        >
          {cell.column.id === "actions" ? (
            <RowActions
              row={row.original}
              pending={pending}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </td>
      ))}
    </tr>
  );
}

function DraggableCard({
  row,
  reorderEnabled,
  showHandle,
  pending,
  selected,
  searchMode,
  onSelect,
  onEdit,
  onDelete,
}: {
  row: Row<GridRow>;
  reorderEnabled: boolean;
  showHandle: boolean;
  pending: boolean;
  selected: boolean;
  searchMode: boolean;
  onSelect(checked: boolean): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const item = row.original;
  const sortable = useSortable({
    id: item.savedRoll.id,
    disabled: !reorderEnabled || pending,
  });
  return (
    <li
      ref={sortable.setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-4",
        selected && "ring-2 ring-ring",
      )}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.7 : 1,
        position: "relative",
        zIndex: sortable.isDragging ? 1 : 0,
      }}
    >
      <div className="flex items-start gap-2">
        <SelectionCheckbox
          ariaLabel={`Select ${item.savedRoll.displayName}`}
          selected={selected}
          onChange={onSelect}
        />
        {showHandle && (
          <DragHandle
            name={item.savedRoll.displayName}
            attributes={sortable.attributes}
            listeners={sortable.listeners}
            disabled={!reorderEnabled || pending}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-semibold">
              <LibraryRollName color={item.savedRoll.nameColor}>
                {item.savedRoll.displayName}
              </LibraryRollName>
            </h3>
            {searchMode && <SourceBadge source={item.source} />}
          </div>
          <RollDetails savedRoll={item.savedRoll} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd><DateValue timestamp={item.savedRoll.createdAt} /></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Edited</dt>
          <dd><DateValue timestamp={item.savedRoll.updatedAt} /></dd>
        </div>
      </dl>
      <div className="mt-2">
        <RowActions
          row={item}
          pending={pending}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}

export function SavedRollGrid({
  rows,
  searchMode,
  searchSort,
  canReorder,
  pending,
  selectedIds,
  onSelectionChange,
  onSearchSortChange,
  onEdit,
  onDelete,
  onReorder,
}: SavedRollGridProps) {
  const mobile = useBrowserMediaQueryV4(MOBILE_GRID_QUERY);
  const [librarySorting, setLibrarySorting] = React.useState<SortingState>([
    { id: "order", desc: false },
  ]);
  const sorting: SortingState = searchMode
    ? [{ id: searchSort.column, desc: searchSort.direction === "desc" }]
    : librarySorting;
  const gridRows = React.useMemo<GridRow[]>(
    () => rows.map((row, index) => ({ ...row, order: index + 1 })),
    [rows],
  );

  const columns = React.useMemo<ColumnDef<GridRow>[]>(
    () => [
      ...(searchMode
        ? []
        : [
            {
              accessorKey: "order",
              header: "Order",
              cell: ({ row }: { row: Row<GridRow> }) =>
                String(row.original.order),
            } satisfies ColumnDef<GridRow>,
          ]),
      {
        id: "name",
        accessorFn: (row) => row.savedRoll.displayName,
        header: "Name",
        sortingFn: "text",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <LibraryRollName
              color={row.original.savedRoll.nameColor}
              className="min-w-0 truncate font-semibold"
            >
              {row.original.savedRoll.displayName}
            </LibraryRollName>
            {searchMode && <SourceBadge source={row.original.source} />}
          </div>
        ),
      },
      {
        id: "roll",
        accessorFn: (row) => row.savedRoll.notation,
        header: "Roll",
        sortingFn: "alphanumeric",
        cell: ({ row }) => <RollDetails savedRoll={row.original.savedRoll} />,
      },
      {
        id: "created",
        accessorFn: (row) => row.savedRoll.createdAt,
        header: "Created",
        sortingFn: "basic",
        cell: ({ row }) => <DateValue timestamp={row.original.savedRoll.createdAt} />,
      },
      {
        id: "updated",
        accessorFn: (row) => row.savedRoll.updatedAt,
        header: "Edited",
        sortingFn: "basic",
        cell: ({ row }) => <DateValue timestamp={row.original.savedRoll.updatedAt} />,
      },
      { id: "actions", header: "Actions", enableSorting: false },
    ],
    [searchMode],
  );

  const updateSorting = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting).slice(0, 1);
    if (next.length === 0 || next[0] === undefined) return;
    if (searchMode) {
      if (next[0].id === "order" || next[0].id === "actions") return;
      // SAFETY: The surrounding validation establishes the SavedRollSearchSort invariant used below.
      onSearchSortChange({
        column: next[0].id as SavedRollSearchSort,
        direction: next[0].desc ? "desc" : "asc",
      });
    } else {
      setLibrarySorting(next);
    }
  };

  const table = useReactTable({
    data: gridRows,
    columns,
    getRowId: (row) => row.savedRoll.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: searchMode ? undefined : getSortedRowModel(),
    manualSorting: searchMode,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: {
      sorting,
      columnVisibility: { order: false },
    },
    onSortingChange: updateSorting,
  });
  const displayedRows = table.getRowModel().rows;
  const reorderEnabled =
    canReorder &&
    !searchMode &&
    sorting[0]?.id === "order" &&
    sorting[0]?.desc === false;
  const ids = displayedRows.map((row) => row.original.savedRoll.id);
  const selectedVisibleCount = ids.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = ids.length > 0 && selectedVisibleCount === ids.length;

  const updateSelection = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const toggleAllVisible = (checked: boolean) => {
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onSelectionChange(next);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!reorderEnabled || over === null || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  const sortValue = `${sorting[0]?.id ?? "name"}:${sorting[0]?.desc ? "desc" : "asc"}`;
  const grid = mobile ? (
    <>
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Sort</span>
        <select
          className="h-10 w-full rounded-md border px-3"
          value={sortValue}
          onChange={(event) => {
            const [id, direction] = event.target.value.split(":");
            if (id === undefined || direction === undefined) return;
            updateSorting([{ id, desc: direction === "desc" }]);
          }}
        >
          {!searchMode && <option value="order:asc">Order, ascending</option>}
          {!searchMode && <option value="order:desc">Order, descending</option>}
          <option value="name:asc">Name, A–Z</option>
          <option value="name:desc">Name, Z–A</option>
          <option value="roll:asc">Roll, ascending</option>
          <option value="roll:desc">Roll, descending</option>
          <option value="created:desc">Created, newest</option>
          <option value="created:asc">Created, oldest</option>
          <option value="updated:desc">Edited, newest</option>
          <option value="updated:asc">Edited, oldest</option>
        </select>
      </label>
      <div className="mt-3 flex items-center gap-2 text-sm font-medium">
        <SelectionCheckbox
          ariaLabel="Select all visible rolls"
          selected={allVisibleSelected}
          indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
          onChange={(checked) => toggleAllVisible(checked)}
        />
        <span>Select all</span>
      </div>
      <ul className="mt-3 grid gap-3">
        {displayedRows.map((row) => (
          <DraggableCard
            key={row.id}
            row={row}
            reorderEnabled={reorderEnabled}
            pending={pending}
            selected={selectedIds.has(row.original.savedRoll.id)}
            searchMode={searchMode}
            showHandle={!searchMode}
            onSelect={(checked) =>
              updateSelection(row.original.savedRoll.id, checked)
            }
            onEdit={() => onEdit(row.original)}
            onDelete={() => onDelete(row.original)}
          />
        ))}
      </ul>
    </>
  ) : (
    <div className="overflow-x-auto overflow-y-hidden rounded-lg border bg-card">
      <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b bg-muted/30 text-left">
              <th className="w-12 px-2 py-1 text-center">
                <SelectionCheckbox
                  ariaLabel="Select all visible rolls"
                  selected={allVisibleSelected}
                  indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                  onChange={(checked) => toggleAllVisible(checked)}
                />
              </th>
              {!searchMode && (
                <th className="w-12 px-2 py-1">
                  <span className="sr-only">Move</span>
                </th>
              )}
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    "px-3 py-1 align-middle",
                    (header.column.id === "created" ||
                      header.column.id === "updated") && "w-32",
                    header.column.id === "actions" && "w-28 text-right",
                  )}
                  aria-sort={ariaSort(header.column.getIsSorted())}
                >
                  {header.column.getCanSort() ? (
                    <SortHeader
                      label={String(header.column.columnDef.header)}
                      sorted={header.column.getIsSorted() !== false}
                      direction={header.column.getIsSorted() === "desc" ? "desc" : "asc"}
                      onClick={header.column.getToggleSortingHandler() ?? (() => undefined)}
                    />
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {displayedRows.map((row) => (
            <DraggableTableRow
              key={row.id}
              row={row}
              reorderEnabled={reorderEnabled}
              showHandle={!searchMode}
              pending={pending}
              selected={selectedIds.has(row.original.savedRoll.id)}
              onSelect={(checked) =>
                updateSelection(row.original.savedRoll.id, checked)
              }
              onEdit={() => onEdit(row.original)}
              onDelete={() => onDelete(row.original)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  const content = searchMode ? grid : (
    <div className="grid gap-1">
      <OrderHelp
        manualOrder={sorting[0]?.id === "order" && sorting[0]?.desc === false}
        onRestore={() => setLibrarySorting([{ id: "order", desc: false }])}
      />
      {grid}
    </div>
  );

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        autoScroll={false}
        onDragEnd={dragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {content}
        </SortableContext>
      </DndContext>
    </TooltipProvider>
  );
}

export type { LibraryRow as SavedRollGridRow };
