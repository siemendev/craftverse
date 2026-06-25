#!/bin/sh
# Render runtime config from environment variables into /config.js.
# This lets the same prebuilt image be configured per-environment.
# Any value left empty falls back to the build-time VITE_ var baked into the
# bundle (see src/lib/config.ts).
set -eu

CONFIG_PATH="/usr/share/nginx/html/config.js"

cat > "$CONFIG_PATH" <<EOF
window.__CRAFTVERSE_CONFIG__ = {
  apiBaseUrl: "${VITE_API_BASE_URL:-}",
  oidcAuthority: "${VITE_OIDC_AUTHORITY:-}",
  oidcClientId: "${VITE_OIDC_CLIENT_ID:-}",
  oidcRedirectUri: "${VITE_OIDC_REDIRECT_URI:-}"
};
EOF

echo "craftverse: wrote runtime config to $CONFIG_PATH"
