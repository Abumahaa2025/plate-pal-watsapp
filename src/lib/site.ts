/** Production site URL used for OAuth and email redirects. */
export const SITE_URL = "https://effortless-malasada-6c815c.netlify.app";

/** Prefer configured production URL; fall back to current origin only in local dev. */
export function getAuthRedirectUrl(path = "/auth"): string {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined;
  if (configured && configured.trim()) {
    return `${configured.replace(/\/$/, "")}${path}`;
  }
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return `${SITE_URL}${path}`;
    }
    return `${origin}${path}`;
  }
  return `${SITE_URL}${path}`;
}
