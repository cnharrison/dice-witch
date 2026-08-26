import { AppearanceThumb } from "@/components/AppearanceThumb";
import type { AppearanceThumbVersionParts } from "@/lib/appearance-thumbs";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import * as React from "react";

type MixPickerStartFromRowProps = {
  catalog: AppearanceCatalogV3;
  selectedStyleId: string;
  thumbVersion: AppearanceThumbVersionParts | null;
  disabled?: boolean;
  onSelect(styleId: string): void;
};

const RANDOM_STYLE_ID_V3 = "chaotic";

export function MixPickerStartFromRow({
  catalog,
  selectedStyleId,
  thumbVersion,
  disabled = false,
  onSelect,
}: MixPickerStartFromRowProps) {
  const styleFor = (styleId: string) => {
    const style = catalog.styles.find(({ id }) => id === styleId);
    if (style === undefined) {
      throw new Error(`Appearance complete look is missing: ${styleId}`);
    }
    return style;
  };
  const [hoveredStyleId, setHoveredStyleId] = React.useState<string | null>(
    null,
  );
  const [focusedStyleId, setFocusedStyleId] = React.useState<string | null>(
    null,
  );
  const pendingSelectedCard = React.useRef<HTMLButtonElement | null>(null);
  React.useLayoutEffect(() => {
    const card = pendingSelectedCard.current;
    if (card === null || card.getAttribute("aria-pressed") !== "true") return;
    card.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    pendingSelectedCard.current = null;
  }, [selectedStyleId]);
  const activeStyleId = hoveredStyleId ?? focusedStyleId;
  const activeStyle = activeStyleId === null ? null : styleFor(activeStyleId);

  const card = (styleId: string, badge?: string) => {
    const style = styleFor(styleId);
    const selected = selectedStyleId === styleId;
    return (
      <button
        key={styleId}
        type="button"
        aria-label={badge === undefined ? style.name : `${style.name}, ${badge}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={(event) => {
          pendingSelectedCard.current = event.currentTarget;
          onSelect(styleId);
        }}
        onMouseEnter={() => setHoveredStyleId(styleId)}
        onMouseLeave={() => setHoveredStyleId(null)}
        onFocus={() => setFocusedStyleId(styleId)}
        onBlur={() => setFocusedStyleId(null)}
        className={`relative grid h-20 w-20 shrink-0 snap-start place-items-center rounded-lg border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
          selected
            ? "border-brand bg-brand/10"
            : "border-border hover:border-brand/50 hover:bg-muted/40"
        }`}
      >
        {thumbVersion !== null && (
          <AppearanceThumb
            className="h-[4.5rem] w-[4.5rem]"
            imageClassName="absolute left-1/2 top-1/2 !w-auto max-w-none -translate-x-1/2 -translate-y-1/2 scale-[1.3]"
            kind="preset"
            id={styleId}
            catalogVersion={thumbVersion.catalogVersion}
            rendererRevision={thumbVersion.rendererRevision}
            cacheRevision={thumbVersion.cacheRevision}
            alt=""
          />
        )}
        {badge !== undefined && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 z-10 rounded-full bg-brand px-1.5 py-px text-[0.55rem] font-semibold uppercase tracking-wide text-white"
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <section aria-label="Complete looks">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Complete looks
        </h3>
        <p className="text-xs font-medium text-muted-foreground">
          {activeStyle?.name ?? ""}
        </p>
      </header>
      <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:snap-none">
        {catalog.completeLookStyleIds.map((styleId) =>
          card(
            styleId,
            styleId === RANDOM_STYLE_ID_V3 ? "The default" : undefined,
          ),
        )}
      </div>
    </section>
  );
}
