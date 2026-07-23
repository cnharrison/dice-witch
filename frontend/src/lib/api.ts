import { appConfig } from "@/lib/config";

export function customFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const fullUrl = url.startsWith("/api") ? `${appConfig.apiBase}${url}` : url;
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
  });
}
