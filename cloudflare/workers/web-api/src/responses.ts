export const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: securityHeaders });
}

export function bytesToBase64(value: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < value.length; offset += 32_768) {
    parts.push(String.fromCharCode(...value.subarray(offset, offset + 32_768)));
  }
  return btoa(parts.join(""));
}
