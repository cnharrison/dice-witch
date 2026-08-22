import {
  RENDERER_REVISIONS_V4,
  type RendererRevisionV4,
} from "@dice-witch/dice-v4-model";
import {
  appearanceCatalogForPolicyV3,
  appearanceThumbObjectKeyV3,
  appearanceThumbPreviewRequestV3,
  appearanceThumbnailManifestV3,
  parseAppearanceCatalogPolicyV3,
} from "../../../packages/dice-appearance/src";
import { isPng } from "./appearance-api";
import { json } from "./responses";
import {
  readWorkerSecret,
  type WorkerSecretSource,
} from "../../../packages/worker-secrets/src";

const BAKE_SECRET_HEADER = "x-appearance-thumbs-bake-secret";
const MAX_THUMB_BYTES = 8 * 1024 * 1024;

export type AppearanceThumbsEnv = {
  ROLL_WEB: {
    previewV4(value: unknown): Promise<unknown>;
    previewRendererRevisionV4(): Promise<string>;
  };
  THUMBS: {
    get(key: string): Promise<{ body: ReadableStream } | null>;
    put(
      key: string,
      value: Uint8Array,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
    head(key: string): Promise<unknown>;
  };
  APPEARANCE_CATALOG_POLICY: string;
  APPEARANCE_THUMBS_BAKE_SECRET: WorkerSecretSource;
};

type BakeInput = {
  ids?: readonly string[] | undefined;
  force?: boolean | undefined;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseBakeInput(value: unknown): BakeInput {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "ids" && key !== "force")
  ) {
    throw new Error("Appearance thumbs bake input is invalid");
  }
  const { ids, force } = value as { ids?: unknown; force?: unknown };
  const invalidIds =
    ids !== undefined &&
    (!Array.isArray(ids) ||
      !ids.every((id) => typeof id === "string") ||
      ids.length > 200);
  if (invalidIds || (force !== undefined && typeof force !== "boolean")) {
    throw new Error("Appearance thumbs bake input is invalid");
  }
  return {
    ids: Array.isArray(ids) ? [...ids] : undefined,
    force,
  };
}

function thumbPngBytes(result: unknown): Uint8Array | null {
  if (
    typeof result !== "object" ||
    result === null ||
    !("png" in result) ||
    !(result.png instanceof Uint8Array) ||
    result.png.byteLength < 8 ||
    result.png.byteLength > MAX_THUMB_BYTES ||
    !isPng(result.png)
  ) {
    return null;
  }
  return result.png;
}

function parseThumbKey(
  pathname: string,
): { key: string } | null {
  const match = /^\/thumbs\/(\d+)-([a-z0-9.-]+)\/(preset|material|font|ink)\/([a-z0-9-]+)\.png$/.exec(
    pathname,
  );
  return match === null ? null : { key: pathname.slice(1) };
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
  const reportedRevision = await env.ROLL_WEB.previewRendererRevisionV4();
  if (!RENDERER_REVISIONS_V4.includes(reportedRevision as never)) {
    return json({ error: "appearance_thumbs_revision_unknown" }, 502);
  }
  const rendererRevision = reportedRevision as RendererRevisionV4;

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
    version: 1,
    catalogVersion: catalog.version,
    rendererRevision,
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
  const reportedRevision = await env.ROLL_WEB.previewRendererRevisionV4();
  if (!RENDERER_REVISIONS_V4.includes(reportedRevision as never)) {
    return json({ error: "appearance_thumbs_revision_unknown" }, 502);
  }
  // Thumb object keys embed both parts; consumers must never guess them.
  return json({
    version: 1,
    catalogVersion: catalog.version,
    rendererRevision: reportedRevision,
  });
}

export async function serveAppearanceThumb(
  pathname: string,
  env: Pick<AppearanceThumbsEnv, "THUMBS">,
): Promise<Response> {
  if (parseThumbKey(pathname) === null) {
    return json({ error: "Not found" }, 404);
  }
  const object = await env.THUMBS.get(pathname.slice(1));
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
