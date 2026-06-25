// Runtime config resolution: window.__CRAFTVERSE_CONFIG__ (from /config.js)
// wins when set, otherwise fall back to build-time VITE_ env vars.

declare global {
  interface Window {
    __CRAFTVERSE_CONFIG__?: {
      apiBaseUrl?: string;
      oidcAuthority?: string;
      oidcClientId?: string;
      oidcRedirectUri?: string;
    };
  }
}

const runtime = (typeof window !== "undefined" && window.__CRAFTVERSE_CONFIG__) || {};

function pick(runtimeVal: string | undefined, buildVal: string | undefined): string {
  const r = (runtimeVal ?? "").trim();
  if (r) return r;
  return (buildVal ?? "").trim();
}

export const config = {
  apiBaseUrl:
    pick(runtime.apiBaseUrl, import.meta.env.VITE_API_BASE_URL) || "/api",
  oidcAuthority: pick(runtime.oidcAuthority, import.meta.env.VITE_OIDC_AUTHORITY),
  oidcClientId:
    pick(runtime.oidcClientId, import.meta.env.VITE_OIDC_CLIENT_ID) ||
    "craftverse-web",
  oidcRedirectUri:
    pick(runtime.oidcRedirectUri, import.meta.env.VITE_OIDC_REDIRECT_URI) ||
    (typeof window !== "undefined" ? window.location.origin + "/" : ""),
};

// When no OIDC authority is configured we run in dev mode (no auth gate).
export const authDisabled = !config.oidcAuthority;
