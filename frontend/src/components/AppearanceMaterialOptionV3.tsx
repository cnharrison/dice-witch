import type {
  AppearanceCatalogV3,
  AppearanceMaterial,
} from "@/types/appearance";
import type { MaterialFamilyV4 } from "@dice-witch/dice-v4-model";
import type * as React from "react";
import { AppearanceSelectV3 } from "./AppearanceSelectV3";

type MaterialMetadata<Family extends MaterialFamilyV4> = Extract<
  AppearanceCatalogV3["materials"][number],
  { family: Family }
>;

type Option<Id extends string> = Readonly<{ id: Id; name: string }>;
type Range = Readonly<{ minimum: number; maximum: number; step: number }>;

function metadataFor<Family extends MaterialFamilyV4>(
  catalog: AppearanceCatalogV3,
  family: Family,
): MaterialMetadata<Family> {
  const metadata = catalog.materials.find(
    (candidate) => candidate.family === family,
  );
  if (metadata === undefined) {
    throw new Error(`Appearance material metadata is missing: ${family}`);
  }
  return metadata as MaterialMetadata<Family>;
}

function SelectField<Id extends string>({
  label,
  value,
  options,
  disabled = {},
  onChange,
}: {
  label: string;
  value: Id;
  options: readonly Option<Id>[];
  disabled?: Partial<Record<Id, boolean>>;
  onChange(value: Id): void;
}) {
  return (
    <label className="block space-y-1.5 text-xs font-medium">
      <span className="block">{label}</span>
      <AppearanceSelectV3
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as Id)}
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={disabled[option.id] === true && option.id !== value}
          >
            {option.name}
          </option>
        ))}
      </AppearanceSelectV3>
    </label>
  );
}

function rangeValueDescription(
  label: string,
  value: number,
  range: Range,
): string {
  const position = (value - range.minimum) / (range.maximum - range.minimum);
  const index = Math.min(4, Math.floor(position * 5));
  if (label === "Texture scale" || label === "Crust scale") {
    return ["Fine", "Compact", "Balanced", "Broad", "Coarse"][index] as string;
  }
  if (label === "Dune scale") {
    return ["Tight", "Compact", "Balanced", "Broad", "Sweeping"][index] as string;
  }
  if (label === "Cloud softness") {
    return ["Defined", "Crisp", "Balanced", "Soft", "Diffuse"][index] as string;
  }
  if (label === "Drop scale") {
    return ["Fine", "Small", "Balanced", "Bold", "Broad"][index] as string;
  }
  if (label === "Clarity") {
    return ["Clouded", "Soft", "Balanced", "Clear", "Crystal clear"][index] as string;
  }
  if (label.includes("density")) {
    return ["Sparse", "Light", "Balanced", "Rich", "Dense"][index] as string;
  }
  if (label === "Openness") {
    return ["Closed", "Subtle", "Balanced", "Open", "Airy"][index] as string;
  }
  if (label === "Patina strength") {
    return ["Fresh", "Light", "Balanced", "Aged", "Heavy"][index] as string;
  }
  if (label === "Wind direction") {
    if (value === 0) return "Straight";
    return `${String(Math.abs(value))}° ${value < 0 ? "left" : "right"}`;
  }
  if (label === "Grain size") {
    return ["Fine", "Small", "Balanced", "Coarse", "Chunky"][index] as string;
  }
  if (label === "Cloud cover") {
    return ["Clear", "Sparse", "Balanced", "Layered", "Overcast"][index] as string;
  }
  if (label === "Horizon height") {
    return ["Low", "Lower", "Centered", "High", "Upper"][index] as string;
  }
  if (label === "Streak length") {
    return ["Short", "Brief", "Balanced", "Long", "Extended"][index] as string;
  }
  return ["Faint", "Soft", "Balanced", "Vivid", "Intense"][index] as string;
}

function RangeField({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: Range;
  onChange(value: number): void;
}) {
  const description = rangeValueDescription(label, value, range);
  return (
    <label className="space-y-1 text-xs font-medium">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        aria-label={label}
        aria-valuetext={description}
        type="range"
        value={value}
        min={range.minimum}
        max={range.maximum}
        step={range.step}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        className="h-11 w-full accent-brand sm:h-9"
      />
    </label>
  );
}

export function AppearanceMaterialOptionV3({
  material,
  catalog,
  repeatedGradient,
  onChange,
}: {
  material: AppearanceMaterial;
  catalog: AppearanceCatalogV3;
  repeatedGradient: boolean;
  onChange(material: AppearanceMaterial): void;
}) {
  let controls: React.ReactNode;

  switch (material.family) {
    case "classic": {
      const metadata = metadataFor(catalog, "classic");
      controls = (
        <>
          <SelectField
            label="Classic treatment"
            value={material.treatment}
            options={metadata.treatments}
            disabled={
              repeatedGradient
                ? { solid: true, pattern: true }
                : undefined
            }
            onChange={(treatment) => {
              if (treatment === "pattern") {
                onChange({
                  ...material,
                  treatment,
                  patternId: catalog.editorDefaults.patternId,
                });
                return;
              }
              onChange({
                family: "classic",
                treatment,
                opacity: material.opacity,
                finish: material.finish,
                textureScale: material.textureScale,
              });
            }}
          />
          {material.treatment === "pattern" && (
            <SelectField
              label="Classic pattern"
              value={material.patternId}
              options={catalog.patterns}
              onChange={(patternId) => onChange({ ...material, patternId })}
            />
          )}
          <SelectField
            label="Opacity"
            value={material.opacity}
            options={metadata.opacities}
            onChange={(opacity) => onChange({ ...material, opacity })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "sharp-resin": {
      const metadata = metadataFor(catalog, "sharp-resin");
      controls = (
        <>
          <SelectField
            label="Resin style"
            value={material.style}
            options={metadata.styles}
            onChange={(style) => onChange({ ...material, style })}
          />
          <SelectField
            label="Inclusion"
            value={material.inclusion}
            options={metadata.inclusions}
            onChange={(inclusion) => onChange({ ...material, inclusion })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Clarity"
            value={material.clarity}
            range={metadata.clarity}
            onChange={(clarity) => onChange({ ...material, clarity })}
          />
          <RangeField
            label="Inclusion density"
            value={material.inclusionDensity}
            range={metadata.inclusionDensity}
            onChange={(inclusionDensity) =>
              onChange({ ...material, inclusionDensity })
            }
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "liquid-core": {
      const metadata = metadataFor(catalog, "liquid-core");
      controls = (
        <>
          <SelectField
            label="Liquid core"
            value={material.core}
            options={metadata.cores}
            onChange={(core) => onChange({ ...material, core })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Clarity"
            value={material.clarity}
            range={metadata.clarity}
            onChange={(clarity) => onChange({ ...material, clarity })}
          />
          <RangeField
            label="Particle density"
            value={material.particleDensity}
            range={metadata.particleDensity}
            onChange={(particleDensity) =>
              onChange({ ...material, particleDensity })
            }
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "gemstone": {
      const metadata = metadataFor(catalog, "gemstone");
      controls = (
        <>
          <SelectField
            label="Gemstone"
            value={material.stone}
            options={metadata.stones}
            onChange={(stone) => onChange({ ...material, stone })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Vein density"
            value={material.veinDensity}
            range={metadata.veinDensity}
            onChange={(veinDensity) => onChange({ ...material, veinDensity })}
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "glass": {
      const metadata = metadataFor(catalog, "glass");
      controls = (
        <>
          <SelectField
            label="Glass style"
            value={material.style}
            options={metadata.styles}
            onChange={(style) => onChange({ ...material, style })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Clarity"
            value={material.clarity}
            range={metadata.clarity}
            onChange={(clarity) => onChange({ ...material, clarity })}
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "stone": {
      const metadata = metadataFor(catalog, "stone");
      controls = (
        <>
          <SelectField
            label="Stone"
            value={material.stone}
            options={metadata.stones}
            onChange={(stone) => onChange({ ...material, stone })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Grain density"
            value={material.grainDensity}
            range={metadata.grainDensity}
            onChange={(grainDensity) =>
              onChange({ ...material, grainDensity })
            }
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "metal": {
      const metadata = metadataFor(catalog, "metal");
      controls = (
        <>
          <SelectField
            label="Metal"
            value={material.metal}
            options={metadata.metals}
            onChange={(metal) => onChange({ ...material, metal })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Patina strength"
            value={material.patinaStrength}
            range={metadata.patinaStrength}
            onChange={(patinaStrength) =>
              onChange({ ...material, patinaStrength })
            }
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "hollow-metal": {
      const metadata = metadataFor(catalog, "hollow-metal");
      controls = (
        <>
          <SelectField
            label="Construction"
            value={material.construction}
            options={metadata.constructions}
            onChange={(construction) => onChange({ ...material, construction })}
          />
          <SelectField
            label="Metal"
            value={material.metal}
            options={metadata.metals}
            onChange={(metal) => onChange({ ...material, metal })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Openness"
            value={material.openness}
            range={metadata.openness}
            onChange={(openness) => onChange({ ...material, openness })}
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "wood": {
      const metadata = metadataFor(catalog, "wood");
      controls = (
        <>
          <SelectField
            label="Wood"
            value={material.wood}
            options={metadata.woods}
            onChange={(wood) => onChange({ ...material, wood })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Grain density"
            value={material.grainDensity}
            range={metadata.grainDensity}
            onChange={(grainDensity) =>
              onChange({ ...material, grainDensity })
            }
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "fantasy": {
      const metadata = metadataFor(catalog, "fantasy");
      controls = (
        <>
          <SelectField
            label="Fantasy essence"
            value={material.essence}
            options={metadata.essences}
            onChange={(essence) => onChange({ ...material, essence })}
          />
          <SelectField
            label="Material finish"
            value={material.finish}
            options={metadata.finishes}
            onChange={(finish) => onChange({ ...material, finish })}
          />
          <RangeField
            label="Intensity"
            value={material.intensity}
            range={metadata.intensity}
            onChange={(intensity) => onChange({ ...material, intensity })}
          />
          <RangeField
            label="Texture scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) => onChange({ ...material, textureScale })}
          />
        </>
      );
      break;
    }
    case "elemental": {
      const metadata = metadataFor(catalog, "elemental");
      const selectedStyle = metadata.styleDefaults.find(
        ({ style }) => style === material.style,
      );
      if (selectedStyle === undefined) {
        throw new Error("Elemental material default is missing");
      }
      let styleControls: React.ReactNode;
      if (material.style === "lava") {
        styleControls = (
          <>
            <RangeField
              label="Fissure density"
              value={material.fissureDensity}
              range={metadata.fissureDensity}
              onChange={(fissureDensity) =>
                onChange({ ...material, fissureDensity })
              }
            />
            <RangeField
              label="Glow intensity"
              value={material.glowIntensity}
              range={metadata.glowIntensity}
              onChange={(glowIntensity) =>
                onChange({ ...material, glowIntensity })
              }
            />
            <RangeField
              label="Crust scale"
              value={material.textureScale}
              range={metadata.textureScale}
              onChange={(textureScale) =>
                onChange({ ...material, textureScale })
              }
            />
          </>
        );
      } else if (material.style === "sand") {
        styleControls = (
          <>
            <RangeField
              label="Dune scale"
              value={material.textureScale}
              range={metadata.textureScale}
              onChange={(textureScale) =>
                onChange({ ...material, textureScale })
              }
            />
            <RangeField
              label="Wind direction"
              value={material.windDirection}
              range={metadata.windDirection}
              onChange={(windDirection) =>
                onChange({ ...material, windDirection })
              }
            />
            <RangeField
              label="Grain size"
              value={material.grainSize}
              range={metadata.grainSize}
              onChange={(grainSize) => onChange({ ...material, grainSize })}
            />
          </>
        );
      } else {
        styleControls = (
          <>
            <RangeField
              label="Cloud cover"
              value={material.cloudCover}
              range={metadata.cloudCover}
              onChange={(cloudCover) =>
                onChange({ ...material, cloudCover })
              }
            />
            <RangeField
              label="Horizon height"
              value={material.horizonHeight}
              range={metadata.horizonHeight}
              onChange={(horizonHeight) =>
                onChange({ ...material, horizonHeight })
              }
            />
          </>
        );
      }
      controls = (
        <>
          <SelectField
            label="Elemental style"
            value={material.style}
            options={metadata.styles}
            onChange={(style) => {
              const next = metadata.styleDefaults.find(
                (candidate) => candidate.style === style,
              );
              if (next === undefined) {
                throw new Error("Elemental material default is missing");
              }
              onChange(structuredClone(next));
            }}
          />
          {styleControls}
        </>
      );
      break;
    }
    case "paint": {
      const metadata = metadataFor(catalog, "paint");
      controls = (
        <>
          <RangeField
            label="Drop density"
            value={material.dropDensity}
            range={metadata.dropDensity}
            onChange={(dropDensity) => onChange({ ...material, dropDensity })}
          />
          <RangeField
            label="Drop scale"
            value={material.textureScale}
            range={metadata.textureScale}
            onChange={(textureScale) =>
              onChange({ ...material, textureScale })
            }
          />
          <RangeField
            label="Streak length"
            value={material.streakLength}
            range={metadata.streakLength}
            onChange={(streakLength) =>
              onChange({ ...material, streakLength })
            }
          />
        </>
      );
      break;
    }
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
      {controls}
    </div>
  );
}
