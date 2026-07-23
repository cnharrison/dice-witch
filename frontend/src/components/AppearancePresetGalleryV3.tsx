import type { AppearanceCatalogV3 } from "@/types/appearance";
import { AppearanceSelectV3 } from "./AppearanceSelectV3";

type Style = AppearanceCatalogV3["styles"][number];

const RANDOM_STYLE_ID_V3 = "chaotic";

function catalogStyle(
  catalog: AppearanceCatalogV3,
  styleId: string,
): Style {
  const style = catalog.styles.find(({ id }) => id === styleId);
  if (style === undefined) {
    throw new Error(`Appearance preset style is missing: ${styleId}`);
  }
  return style;
}

function PresetOptions({
  catalog,
  styleIds,
  suffix,
}: {
  catalog: AppearanceCatalogV3;
  styleIds: readonly string[];
  suffix?: string;
}) {
  const styles = styleIds
    .map((styleId) => catalogStyle(catalog, styleId))
    .sort((left, right) => left.name.localeCompare(right.name));
  return styles.map((style) => (
    <option key={style.id} value={style.id}>
      {style.name}{suffix}
    </option>
  ));
}

export function AppearancePresetGalleryV3({
  catalog,
  selectedStyleId,
  disabled = false,
  onSelect,
}: {
  catalog: AppearanceCatalogV3;
  selectedStyleId: string;
  disabled?: boolean;
  onSelect(styleId: string): void;
}) {
  const visibleStyleIds = new Set([
    ...catalog.featuredStyleIds,
    ...catalog.collectorStyleIds,
  ]);
  const historicalStyleId =
    selectedStyleId !== "" && !visibleStyleIds.has(selectedStyleId)
      ? selectedStyleId
      : null;

  return (
    <label className="block space-y-1.5 text-sm font-semibold">
      <span className="block">Preset</span>
      <AppearanceSelectV3
        aria-label="Preset"
        value={selectedStyleId}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
        className="font-normal sm:h-10"
      >
        {selectedStyleId === "" && (
          <option value="" disabled>
            Custom design
          </option>
        )}
        <optgroup label="Random">
          <PresetOptions catalog={catalog} styleIds={[RANDOM_STYLE_ID_V3]} />
        </optgroup>
        <optgroup label="Styles">
          <PresetOptions
            catalog={catalog}
            styleIds={catalog.featuredStyleIds.filter(
              (styleId) => styleId !== RANDOM_STYLE_ID_V3,
            )}
          />
        </optgroup>
        <optgroup label="Materials">
          <PresetOptions
            catalog={catalog}
            styleIds={catalog.collectorStyleIds}
          />
        </optgroup>
        {historicalStyleId !== null && (
          <optgroup label="Archive">
            <PresetOptions
              catalog={catalog}
              styleIds={[historicalStyleId]}
              suffix=" — Archive"
            />
          </optgroup>
        )}
      </AppearanceSelectV3>
    </label>
  );
}
