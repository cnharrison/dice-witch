import {
  IDENTITY_TEXTURE_PLACEMENT_V4,
  canonicalTextureGenerationInputV4,
  createTextureGenerationInputV4,
  engravingFontScaleV4,
  generateMaterialTextureV4,
  getRenderGeometryDescriptorV4,
  parseRenderRequestV4Json,
  rendererRevisionPolicyV4,
  resolveEngravingContrastEdgeV4,
  serializeRenderRequestV4,
  texturePlacementKeyV4,
  usesProjectedTextureMappingV4,
  type RenderDieV4,
  type RenderLightingV4,
  type RendererRevisionV4,
  type RenderRequestV4,
  type TextureColorPolicyV4,
  type TextureRasterV4,
  type TextureScopeV4,
} from "@dice-witch/dice-v4-model";
import {
  canvasKitFailureNameV4,
  type CanvasKitFailureNameV4,
} from "./error-diagnostics";
import {
  CanvasKitGeometryRendererV4,
  type CanvasKitGeometryRendererOptionsV4,
  type PolyhedralRenderPolicyV4,
  type RenderGeometryGridDieV4,
  type RenderedGeometryGridV4,
} from "./geometry-renderer";
import { renderLightingKeyV4 } from "./lighting";
import { createOctahedralTextureAtlasV4 } from "./octahedral-texture-atlas";
import {
  createSphericalMaterialRasterV4,
  type SphericalMaterialRasterV4,
} from "./spherical-material-raster";

export type RenderedDiceRequestV4 = RenderedGeometryGridV4 & {
  rendererRevision: RendererRevisionV4;
};

export type DiceRequestRenderOptionsV4 = {
  blankFaces?: boolean;
};

export interface DiceRequestRendererV4 {
  renderValidated(
    request: RenderRequestV4,
    options?: DiceRequestRenderOptionsV4,
  ): Promise<RenderedDiceRequestV4>;
  dispose(): void;
}

export type DiceRequestRendererFactoryV4 = () =>
  | DiceRequestRendererV4
  | Promise<DiceRequestRendererV4>;

export type RendererV4FailurePhase = "initialization" | "render" | "cleanup";

export type RendererV4FailureName = CanvasKitFailureNameV4;

export type RendererV4FailureDiagnostic = {
  attempt: 1 | 2;
  phase: RendererV4FailurePhase;
  name: RendererV4FailureName;
};

export class RendererV4FailedError extends Error {
  readonly code = "renderer_v4_failed";
  readonly attempts = 2;
  readonly failures: readonly RendererV4FailureDiagnostic[];

  constructor(failures: readonly RendererV4FailureDiagnostic[]) {
    super("CanvasKit V4 rendering failed after two attempts");
    this.name = "RendererV4FailedError";
    this.failures = Object.freeze([...failures]);
  }
}

function assertCanvasKitGeometrySupport(request: RenderRequestV4): void {
  for (const group of request.groups) {
    for (const die of group) {
      getRenderGeometryDescriptorV4(request.rendererRevision, die);
    }
  }
}

type TextureCachesV4 = {
  sources: Map<string, TextureRasterV4>;
  octahedralAtlases: Map<string, TextureRasterV4>;
  sphericalMaterials: Map<string, SphericalMaterialRasterV4>;
};

function textureColorPolicyV4(
  rendererRevision: RendererRevisionV4,
): TextureColorPolicyV4 {
  return rendererRevisionPolicyV4(rendererRevision).textureColors;
}

function renderPolicyV4(
  rendererRevision: RendererRevisionV4,
  geometryId: string,
): PolyhedralRenderPolicyV4 {
  const policy = rendererRevisionPolicyV4(rendererRevision);
  if (policy.presentation !== "legacy") return policy.presentation;
  return policy.d20Geometry === "r2" && geometryId === "d20-standard-r2"
    ? "d20-r3"
    : "legacy";
}

function lightingForDieV4(
  die: RenderDieV4,
  rendererRevision: RendererRevisionV4,
): RenderLightingV4 {
  const { lighting, material } = die.appearance;
  if (
    rendererRevisionPolicyV4(rendererRevision)
      .restrainedClassicGradientLighting &&
    material.family === "classic" &&
    material.treatment === "gradient" &&
    lighting.mode === "combined" &&
    lighting.strength === "gentle"
  ) {
    return {
      mode: "directional",
      strength: "gentle",
      direction: lighting.direction,
    };
  }
  return lighting;
}

type DieTexturesV4 = {
  source: TextureRasterV4;
  rendered: TextureRasterV4;
};

function texturesForDieV4(
  die: RenderDieV4,
  textures: TextureCachesV4,
  useOctahedralAtlas: boolean,
  rendererRevision: RendererRevisionV4,
): DieTexturesV4 {
  const key = canonicalTextureGenerationInputV4(die.appearance);
  let source = textures.sources.get(key);
  if (source === undefined) {
    source = generateMaterialTextureV4(
      createTextureGenerationInputV4(die.appearance),
      textureColorPolicyV4(rendererRevision),
    );
    textures.sources.set(key, source);
  }
  if (!useOctahedralAtlas) return { source, rendered: source };

  const atlasKey = `${key}|${texturePlacementKeyV4(
    die.appearance.texture,
  )}`;
  let rendered = textures.octahedralAtlases.get(atlasKey);
  if (rendered === undefined) {
    rendered = createOctahedralTextureAtlasV4(
      source,
      die.appearance.texture,
    );
    textures.octahedralAtlases.set(atlasKey, rendered);
  }
  return { source, rendered };
}

function textureScopeForDie(
  die: RenderDieV4,
  rendererRevision: RendererRevisionV4,
): TextureScopeV4 {
  if (rendererRevision === "canvaskit-v4-r1") return "die-wide";
  const scope = die.appearance.texture.scope;
  if (scope === undefined) {
    throw new Error("CanvasKit V4 r2 texture scope is missing");
  }
  return scope;
}

function geometryGridDie(
  die: RenderDieV4,
  textures: TextureCachesV4,
  rendererRevision: RendererRevisionV4,
  options: DiceRequestRenderOptionsV4,
): RenderGeometryGridDieV4 {
  const geometry = getRenderGeometryDescriptorV4(rendererRevision, die);
  const lighting = lightingForDieV4(die, rendererRevision);
  const textureScope = textureScopeForDie(die, rendererRevision);
  const usesProjectedTexture =
    geometry.kind === "polyhedral" &&
    usesProjectedTextureMappingV4(rendererRevision, die.appearance);
  const usesOctahedralAtlas =
    !usesProjectedTexture &&
    textureScope === "die-wide" &&
    geometry.kind === "polyhedral" &&
    geometry.skinMapping.kind === "view-octahedral";
  const { source: sourceTexture, rendered: texture } = texturesForDieV4(
    die,
    textures,
    usesOctahedralAtlas,
    rendererRevision,
  );
  const engravingContrastEdge = rendererRevisionPolicyV4(rendererRevision)
    .engravingContrastEdge
      ? resolveEngravingContrastEdgeV4(
          die.appearance,
          sourceTexture,
          die.target === "d4",
        )
      : null;
  const engravingFontScale = engravingFontScaleV4(
    rendererRevision,
    die.target,
    die.appearance.engraving.fontId,
  );
  if (geometry.kind === "sphere") {
    if (die.target !== "other") {
      throw new Error("CanvasKit V4 sphere target is invalid");
    }
    const key = `${canonicalTextureGenerationInputV4(
      die.appearance,
    )}|${texturePlacementKeyV4(
      die.appearance.texture,
    )}|${renderLightingKeyV4(
      lighting,
      die.appearance.material.family,
    )}`;
    let materialRaster = textures.sphericalMaterials.get(key);
    if (materialRaster === undefined) {
      materialRaster = createSphericalMaterialRasterV4(
        texture,
        lighting,
        die.appearance.material.family,
        die.appearance.texture,
      );
      textures.sphericalMaterials.set(key, materialRaster);
    }
    return {
      kind: "sphere",
      geometry,
      sides: die.sides,
      result: die.result,
      fontId: die.appearance.engraving.fontId,
      materialRaster,
      engravingColor: die.appearance.engraving.color,
      engravingFinish: die.appearance.engraving.finish,
      ...(engravingContrastEdge === null
        ? {}
        : { engravingContrastEdge }),
      engravingFontScale,
      lighting,
      materialFamily: die.appearance.material.family,
      requiresLocalSeparation: die.appearance.requiresLocalSeparation,
      criticalEffect: die.appearance.effect,
      blankFaces: options.blankFaces === true,
      renderPolicy: renderPolicyV4(rendererRevision, geometry.id),
      icons: die.icons,
    };
  }
  let textureMapping: "source" | "octahedral-atlas" | "projected-texture" =
    "source";
  if (usesProjectedTexture) textureMapping = "projected-texture";
  else if (usesOctahedralAtlas) textureMapping = "octahedral-atlas";
  return {
    kind: "polyhedral",
    geometry,
    result: die.result,
    fontId: die.appearance.engraving.fontId,
    texture,
    textureMapping,
    texturePlacement: usesOctahedralAtlas
      ? IDENTITY_TEXTURE_PLACEMENT_V4
      : die.appearance.texture,
    textureScope,
    engravingColor: die.appearance.engraving.color,
    engravingFinish: die.appearance.engraving.finish,
    ...(engravingContrastEdge === null
      ? {}
      : { engravingContrastEdge }),
    engravingFontScale,
    lighting,
    materialFamily: die.appearance.material.family,
    requiresLocalSeparation: die.appearance.requiresLocalSeparation,
    criticalEffect: die.appearance.effect,
    blankFaces: options.blankFaces === true,
    renderPolicy: renderPolicyV4(rendererRevision, geometry.id),
    icons: die.icons,
  };
}

async function renderCanvasKit(
  renderer: CanvasKitGeometryRendererV4,
  request: RenderRequestV4,
  options: DiceRequestRenderOptionsV4,
): Promise<RenderedDiceRequestV4> {
  const textures: TextureCachesV4 = {
    sources: new Map(),
    octahedralAtlases: new Map(),
    sphericalMaterials: new Map(),
  };
  const rendered = await renderer.renderGeometryGrid({
    rendererRevision: request.rendererRevision,
    groups: request.groups.map((group) =>
      group.map((die) =>
        geometryGridDie(
          die,
          textures,
          request.rendererRevision,
          options,
        ),
      ),
    ),
  });
  return {
    ...rendered,
    rendererRevision: request.rendererRevision,
  };
}

type RevisionRendererV4 = (
  renderer: CanvasKitGeometryRendererV4,
  request: RenderRequestV4,
  options: DiceRequestRenderOptionsV4,
) => Promise<RenderedDiceRequestV4>;

const RENDERER_REVISION_DISPATCH_V4 = Object.freeze({
  "canvaskit-v4-r1": renderCanvasKit,
  "canvaskit-v4-r2": renderCanvasKit,
  "canvaskit-v4-r3": renderCanvasKit,
  "canvaskit-v4-r4": renderCanvasKit,
  "canvaskit-v4-r5": renderCanvasKit,
  "canvaskit-v4-r6": renderCanvasKit,
  "canvaskit-v4-r7": renderCanvasKit,
  "canvaskit-v4-r8": renderCanvasKit,
  "canvaskit-v4-r9": renderCanvasKit,
  "canvaskit-v4-r10": renderCanvasKit,
} satisfies Record<RendererRevisionV4, RevisionRendererV4>);

export class CanvasKitDiceRequestRendererV4 implements DiceRequestRendererV4 {
  readonly #geometryRenderer: CanvasKitGeometryRendererV4;
  #disposed = false;

  constructor(options: CanvasKitGeometryRendererOptionsV4) {
    this.#geometryRenderer = new CanvasKitGeometryRendererV4(options);
  }

  renderValidated(
    request: RenderRequestV4,
    options: DiceRequestRenderOptionsV4 = {},
  ): Promise<RenderedDiceRequestV4> {
    if (this.#disposed) {
      throw new Error("CanvasKit V4 request renderer is disposed");
    }
    const renderRevision = RENDERER_REVISION_DISPATCH_V4[request.rendererRevision];
    return renderRevision(this.#geometryRenderer, request, options);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#geometryRenderer.dispose();
  }
}

type AttemptResultV4 =
  | { ok: true; rendered: RenderedDiceRequestV4 }
  | {
      ok: false;
      diagnostics: RendererV4FailureDiagnostic[];
      causes: unknown[];
    };

async function renderAttempt(
  request: RenderRequestV4,
  createRenderer: DiceRequestRendererFactoryV4,
  attempt: 1 | 2,
  options: DiceRequestRenderOptionsV4,
): Promise<AttemptResultV4> {
  let renderer: DiceRequestRendererV4;
  try {
    renderer = await createRenderer();
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          attempt,
          phase: "initialization",
          name: canvasKitFailureNameV4(error),
        },
      ],
      causes: [error],
    };
  }

  let rendered: RenderedDiceRequestV4;
  try {
    rendered = await renderer.renderValidated(request, options);
  } catch (renderError) {
    const diagnostics: RendererV4FailureDiagnostic[] = [
      {
        attempt,
        phase: "render",
        name: canvasKitFailureNameV4(renderError),
      },
    ];
    const causes: unknown[] = [renderError];
    try {
      renderer.dispose();
    } catch (cleanupError) {
      diagnostics.push({
        attempt,
        phase: "cleanup",
        name: canvasKitFailureNameV4(cleanupError),
      });
      causes.push(cleanupError);
    }
    return { ok: false, diagnostics, causes };
  }

  try {
    renderer.dispose();
  } catch (cleanupError) {
    return {
      ok: false,
      diagnostics: [
        {
          attempt,
          phase: "cleanup",
          name: canvasKitFailureNameV4(cleanupError),
        },
      ],
      causes: [cleanupError],
    };
  }
  return { ok: true, rendered };
}

function validatedRequest(value: unknown): RenderRequestV4 {
  const request = parseRenderRequestV4Json(serializeRenderRequestV4(value));
  assertCanvasKitGeometrySupport(request);
  return request;
}

export async function renderDiceRequestV4ToPng(
  value: unknown,
  createRenderer: DiceRequestRendererFactoryV4,
  options: DiceRequestRenderOptionsV4 = {},
): Promise<RenderedDiceRequestV4> {
  const request = validatedRequest(value);
  const attempt = await renderAttempt(request, createRenderer, 1, options);
  if (attempt.ok) return attempt.rendered;
  throw new AggregateError(
    attempt.causes,
    "CanvasKit V4 render attempt failed",
    { cause: attempt.causes[0] },
  );
}

export async function renderV4WithSingleRetry(
  serializedRequest: string,
  createRenderer: DiceRequestRendererFactoryV4,
  options: DiceRequestRenderOptionsV4 = {},
): Promise<RenderedDiceRequestV4> {
  const request = parseRenderRequestV4Json(serializedRequest);
  assertCanvasKitGeometrySupport(request);
  const validatedBytes = serializeRenderRequestV4(request);
  const failures: RendererV4FailureDiagnostic[] = [];
  for (const attempt of [1, 2] as const) {
    const result = await renderAttempt(
      parseRenderRequestV4Json(validatedBytes),
      createRenderer,
      attempt,
      options,
    );
    if (result.ok) return result.rendered;
    failures.push(...result.diagnostics);
  }
  const failure = new RendererV4FailedError(failures);
  console.error(
    JSON.stringify({
      level: "error",
      message: "CanvasKit V4 rendering failed",
      code: failure.code,
      rendererRevision: request.rendererRevision,
      diceCount: request.groups.reduce(
        (count, group) => count + group.length,
        0,
      ),
      attempts: failure.attempts,
      failures: failure.failures,
    }),
  );
  throw failure;
}
