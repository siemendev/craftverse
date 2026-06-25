// Runtime configuration. In production this file is replaced by nginx entrypoint
// (or a mounted ConfigMap) so the same image works in any environment.
// Build-time VITE_ vars are used as fallback when a value is empty.
window.__CRAFTVERSE_CONFIG__ = {
  apiBaseUrl: "",
  oidcAuthority: "",
  oidcClientId: "",
  oidcRedirectUri: "",
};
