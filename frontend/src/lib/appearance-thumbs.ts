export type AppearanceThumbKind = "preset" | "material" | "font" | "ink";

export type AppearanceThumbVersionParts = {
  catalogVersion: number;
  rendererRevision: string;
};

// Mirrors the object keys written by the web-api bake route.
export function appearanceThumbUrl(
  apiBase: string,
  parts: AppearanceThumbVersionParts,
  kind: AppearanceThumbKind,
  id: string,
): string {
  return `${apiBase}/thumbs/${parts.catalogVersion}-${parts.rendererRevision}/${kind}/${id}.png`;
}
