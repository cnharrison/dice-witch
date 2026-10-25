import { z } from "zod";

export async function tokenDigest(token: string): Promise<string> {
  if (!z.string().min(50).max(256).safeParse(token).success) throw new Error("Benchmark token is invalid");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function matchesToken(provided: string | null, expected: string): Promise<boolean> {
  if (provided === null || !z.string().max(256).safeParse(provided).success || !z.string().min(50).safeParse(expected).success) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([provided, expected].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  if (left === undefined || right === undefined) throw new Error("Benchmark token digests are missing");
  return crypto.subtle.timingSafeEqual(left, right);
}

export async function smallBody(request: Request): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return body + decoder.decode();
    const value: unknown = chunk.value;
    if (!(value instanceof Uint8Array)) throw new Error("Benchmark body stream is not bytes");
    bytes += value.byteLength;
    if (bytes > 4_096) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

export async function authorized(request: Request, token: string, scheme = "Bearer"): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(`${scheme} `)) return false;
  return matchesToken(header.slice(scheme.length + 1), token);
}
