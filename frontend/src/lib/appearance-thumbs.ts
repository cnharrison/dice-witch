export type AppearanceThumbKind = "preset" | "material" | "font" | "ink";

export type AppearanceThumbVersionParts = {
  catalogVersion: number;
  rendererRevision: string;
  cacheRevision: number;
};

// Uses the baked object key plus the server-owned cache revision.
export function appearanceThumbUrl(
  apiBase: string,
  parts: AppearanceThumbVersionParts,
  kind: AppearanceThumbKind,
  id: string,
): string {
  return `${apiBase}/thumbs/${parts.catalogVersion}-${parts.rendererRevision}/${kind}/${id}.png?v=${parts.cacheRevision}`;
}
