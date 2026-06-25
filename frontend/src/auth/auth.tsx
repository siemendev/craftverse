import { createContext, useContext, type ReactNode } from "react";
import {
  AuthProvider as OidcAuthProvider,
  useAuth as useOidcAuth,
  type AuthProviderProps,
} from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { authDisabled, config } from "@/lib/config";
import { setTokenGetter } from "@/api/client";

/**
 * Auth abstraction. Atlases are public, so the app renders for everyone — there
 * is no login gate. Logging in (Authorization Code + PKCE against Keycloak) only
 * unlocks editing. When VITE_OIDC_AUTHORITY is unset (`authDisabled`, local
 * bring-up) the user counts as authenticated so all edit affordances work.
 */

interface AuthInfo {
  /** True when the user may edit (logged in, or auth disabled in dev). */
  isAuthenticated: boolean;
  displayName: string;
  login: () => void;
  logout: () => void;
}

const DevAuthContext = createContext<AuthInfo>({
  isAuthenticated: true,
  displayName: "Local Developer",
  login: () => {},
  logout: () => {},
});

const oidcConfig: AuthProviderProps = {
  authority: config.oidcAuthority,
  client_id: config.oidcClientId,
  redirect_uri: config.oidcRedirectUri,
  post_logout_redirect_uri: config.oidcRedirectUri,
  response_type: "code",
  scope: "openid profile email",
  userStore:
    typeof window !== "undefined"
      ? new WebStorageStateStore({ store: window.localStorage })
      : undefined,
  // Strip the `?code=...&state=...` from the URL after a successful login.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (authDisabled) {
    // Dev mode: no token, no login needed — editing is always enabled.
    setTokenGetter(() => undefined);
    return (
      <DevAuthContext.Provider
        value={{
          isAuthenticated: true,
          displayName: "Local Developer",
          login: () => {},
          logout: () => {},
        }}
      >
        {children}
      </DevAuthContext.Provider>
    );
  }
  return (
    <OidcAuthProvider {...oidcConfig}>
      <OidcBridge>{children}</OidcBridge>
    </OidcAuthProvider>
  );
}

function OidcBridge({ children }: { children: ReactNode }) {
  const auth = useOidcAuth();

  // Bridge the access token into the (non-React) API client. This MUST run
  // synchronously during render, not in an effect: a child's mount effects fire
  // before the parent's, so an effect here would register the token only AFTER
  // AtlasProvider already issued its first (token-less) request — which would
  // leave authenticated calls unauthenticated until the next manual refresh.
  setTokenGetter(() => auth.user?.access_token);

  // No gate: the app renders for everyone. Login is initiated explicitly via
  // the top bar and only unlocks editing.
  return <>{children}</>;
}

/**
 * Unified hook returning auth state + actions, regardless of auth mode.
 */
export function useAppAuth(): AuthInfo {
  if (authDisabled) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(DevAuthContext);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useOidcAuth();
  const p = auth.user?.profile;
  const displayName =
    p?.name ||
    [p?.given_name, p?.family_name].filter(Boolean).join(" ") ||
    p?.preferred_username ||
    "User";
  return {
    isAuthenticated: auth.isAuthenticated,
    displayName,
    login: () => void auth.signinRedirect(),
    logout: () => {
      void auth.removeUser().then(() => {
        // End the session at Keycloak too if possible.
        void auth.signoutRedirect().catch(() => {
          window.location.href = config.oidcRedirectUri || "/";
        });
      });
    },
  };
}
