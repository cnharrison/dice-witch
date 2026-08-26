import {
  RENDERER_REVISIONS_V4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  APPEARANCE_THUMB_CACHE_REVISION_V3,
  appearanceCatalogForPolicyV3,
  appearanceThumbObjectKeyV3,
  appearanceThumbPreviewRequestV3,
  appearanceThumbnailManifestV3,
  parseAppearanceCatalogPolicyV3,
  type AppearancePreviewRequestV4,
} from "../../../packages/dice-appearance/src";
import {
  strictObjectSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  readWorkerSecret,
  type WorkerSecretSource,
} from "../../../packages/worker-secrets/src";
import { isPng } from "./appearance-api";
import { json } from "./responses";

const BAKE_SECRET_HEADER = "x-appearance-thumbs-bake-secret";
const MAX_THUMB_BYTES = 8 * 1024 * 1024;
const RendererRevisionSchema = z.enum(RENDERER_REVISIONS_V4);
const BakeInputSchema = strictObjectSchema({
  ids: z.array(z.string()).max(200).optional(),
  force: z.boolean().optional(),
});
const ThumbRenderResultSchema = strictObjectSchema({
  version: z.literal(4),
  contentType: z.literal("image/png"),
  width: z.number().refine(Number.isSafeInteger),
  height: z.number().refine(Number.isSafeInteger),
  diceCount: z.number().refine(Number.isSafeInteger),
  rowCount: z.number().refine(Number.isSafeInteger),
  png: z.instanceof(Uint8Array).refine(
    (png) => png.byteLength >= 8 && png.byteLength <= MAX_THUMB_BYTES,
  ),
});

type AppearanceThumbObject = {
  body: ReadableStream<Uint8Array>;
};
type AppearanceThumbStore = {
  get(key: string): Promise<AppearanceThumbObject | null>;
  put(
    key: string,
    value: Uint8Array,
    options?: R2PutOptions,
  ): Promise<SchemaInput>;
  head(key: string): Promise<object | null>;
};

export type AppearanceThumbsEnv = {
  ROLL_WEB: {
    previewV4(value: AppearancePreviewRequestV4): Promise<SchemaInput>;
    previewRendererRevisionV4(): Promise<string>;
  };
  THUMBS: AppearanceThumbStore;
  APPEARANCE_CATALOG_POLICY: string;
  APPEARANCE_THUMBS_BAKE_SECRET: WorkerSecretSource;
};

type BakeInput = z.output<typeof BakeInputSchema>;
type ThumbKey = { key: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseBakeInput(value: SchemaInput): BakeInput {
  return BakeInputSchema.parse(value);
}

function thumbPngBytes(value: SchemaInput): Uint8Array | null {
  const result = ThumbRenderResultSchema.safeParse(value);
  if (!result.success || !isPng(result.data.png)) return null;
  return result.data.png;
}

function parseThumbKey(pathname: string): ThumbKey | null {
  const match = /^\/thumbs\/(\d+)-([a-z0-9.-]+)\/(preset|material|font|ink)\/([a-z0-9-]+)\.png$/.exec(
    pathname,
  );
  return match === null ? null : { key: pathname.slice(1) };
}

function parseRendererRevision(value: string): RendererRevisionV4 | null {
  const result = RendererRevisionSchema.safeParse(value);
  return result.success ? result.data : null;
}

export async function bakeAppearanceThumbs(
  request: Request,
  env: AppearanceThumbsEnv,
): Promise<Response> {
  let secret: string;
  try {
    secret = await readWorkerSecret(
      env.APPEARANCE_THUMBS_BAKE_SECRET,
      "APPEARANCE_THUMBS_BAKE_SECRET",
    );
  } catch {
    return json({ error: "appearance_thumbs_unconfigured" }, 500);
  }
  const provided = request.headers.get(BAKE_SECRET_HEADER);
  if (
    provided === null ||
    (await sha256Hex(provided)) !== (await sha256Hex(secret))
  ) {
    return json({ error: "appearance_thumbs_forbidden" }, 403);
  }

  let input: BakeInput;
  try {
    input = parseBakeInput(await request.json().catch(() => undefined));
  } catch {
    return json({ error: "appearance_thumbs_input_invalid" }, 400);
  }

  const catalog = appearanceCatalogForPolicyV3(
    parseAppearanceCatalogPolicyV3(env.APPEARANCE_CATALOG_POLICY),
  );
  const rendererRevision = parseRendererRevision(
    await env.ROLL_WEB.previewRendererRevisionV4(),
  );
  if (rendererRevision === null) {
    return json({ error: "appearance_thumbs_revision_unknown" }, 502);
  }

  const requestedIds = input.ids === undefined ? null : new Set(input.ids);
  const manifest = appearanceThumbnailManifestV3(catalog, rendererRevision)
    .filter(({ kind, id }) =>
      requestedIds === null ? true : requestedIds.has(`${kind}/${id}`),
    );

  let baked = 0;
  let skipped = 0;
  for (const spec of manifest) {
    const key = appearanceThumbObjectKeyV3(
      { catalogVersion: catalog.version, rendererRevision },
      spec,
    );
    if (input.force !== true && (await env.THUMBS.head(key)) !== null) {
      skipped += 1;
      continue;
    }
    const result = await env.ROLL_WEB.previewV4(
      appearanceThumbPreviewRequestV3(spec),
    );
    const png = thumbPngBytes(result);
    if (png === null) {
      return json({ error: "appearance_thumbs_render_invalid", key }, 502);
    }
    await env.THUMBS.put(key, png, {
      httpMetadata: { contentType: "image/png" },
    });
    baked += 1;
  }

  return json({
    version: 2,
    catalogVersion: catalog.version,
    rendererRevision,
    cacheRevision: APPEARANCE_THUMB_CACHE_REVISION_V3,
    baked,
    skipped,
    total: manifest.length,
  });
}

export async function appearanceThumbsVersion(
  env: Pick<
    AppearanceThumbsEnv,
    "ROLL_WEB" | "APPEARANCE_CATALOG_POLICY"
  >,
): Promise<Response> {
  const catalog = appearanceCatalogForPolicyV3(
    parseAppearanceCatalogPolicyV3(env.APPEARANCE_CATALOG_POLICY),
  );
  const rendererRevision = parseRendererRevision(
    await env.ROLL_WEB.previewRendererRevisionV4(),
  );
  if (rendererRevision === null) {
    return json({ error: "appearance_thumbs_revision_unknown" }, 502);
  }
  return json({
    version: 2,
    catalogVersion: catalog.version,
    rendererRevision,
    cacheRevision: APPEARANCE_THUMB_CACHE_REVISION_V3,
  });
}

export async function serveAppearanceThumb(
  pathname: string,
  env: Pick<AppearanceThumbsEnv, "THUMBS">,
): Promise<Response> {
  const thumb = parseThumbKey(pathname);
  if (thumb === null) {
    return json({ error: "Not found" }, 404);
  }
  const object = await env.THUMBS.get(thumb.key);
  if (object === null) {
    return json({ error: "Not found" }, 404);
  }
  return new Response(object.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
