import { AppearanceThumb } from "@/components/AppearanceThumb";
import type { AppearanceThumbVersionParts } from "@/lib/appearance-thumbs";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import { ChevronRight } from "lucide-react";
import * as React from "react";

type MixPickerStartFromRowProps = {
  catalog: AppearanceCatalogV3;
  selectedStyleId: string;
  thumbVersion: AppearanceThumbVersionParts | null;
  disabled?: boolean;
  onSelect(styleId: string): void;
};

const INITIAL_CARD_COUNT = 4;
const RANDOM_STYLE_ID_V3 = "chaotic";

export function MixPickerStartFromRow({
  catalog,
  selectedStyleId,
  thumbVersion,
  disabled = false,
  onSelect,
}: MixPickerStartFromRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const styleFor = (styleId: string) => {
    const style = catalog.styles.find(({ id }) => id === styleId);
    if (style === undefined) {
      throw new Error(`Appearance start-from style is missing: ${styleId}`);
    }
    return style;
  };
  const visibleIds = expanded
    ? [...catalog.featuredStyleIds]
    : catalog.featuredStyleIds.slice(0, INITIAL_CARD_COUNT);
  const hiddenCount =
    catalog.featuredStyleIds.length +
    catalog.collectorStyleIds.length -
    visibleIds.length;

  const card = (styleId: string, badge?: string) => {
    const style = styleFor(styleId);
    const selected = selectedStyleId === styleId;
    return (
      <button
        key={styleId}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onSelect(styleId)}
        className={`relative flex w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          selected
            ? "border-brand bg-brand/10"
            : "border-border hover:border-brand/50 hover:bg-muted/40"
        }`}
      >
        {badge !== undefined && (
          <span className="absolute -top-2 rounded-full bg-brand px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-white">
            {badge}
          </span>
        )}
        <span className="grid h-14 w-full place-items-center">
          {thumbVersion !== null && (
            <AppearanceThumb
              kind="preset"
              id={styleId}
              catalogVersion={thumbVersion.catalogVersion}
              rendererRevision={thumbVersion.rendererRevision}
              alt=""
            />
          )}
        </span>
        {style.name}
      </button>
    );
  };

  return (
    <section aria-label="Start from">
      <h3 className="text-xs font-semibold uppercase tracking-wide">
        Start from
      </h3>
      <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {visibleIds.map((styleId) =>
          card(
            styleId,
            styleId === RANDOM_STYLE_ID_V3 ? "The default" : undefined,
          ),
        )}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {hiddenCount} more
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && catalog.collectorStyleIds.length > 0 && (
        <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {catalog.collectorStyleIds.map((styleId) => card(styleId))}
        </div>
      )}
    </section>
  );
}
