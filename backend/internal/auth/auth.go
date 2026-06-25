// Package auth provides OIDC bearer-token validation middleware.
package auth

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

type ctxKey string

const userCtxKey ctxKey = "craftverse.user"

// User is the authenticated principal extracted from a verified token.
type User struct {
	Subject     string
	DisplayName string
}

// claims mirrors the subset of OIDC claims we read for the display name.
type claims struct {
	Name              string `json:"name"`
	GivenName         string `json:"given_name"`
	FamilyName        string `json:"family_name"`
	PreferredUsername string `json:"preferred_username"`
}

func (c claims) displayName() string {
	if c.Name != "" {
		return c.Name
	}
	if c.GivenName != "" || c.FamilyName != "" {
		return strings.TrimSpace(c.GivenName + " " + c.FamilyName)
	}
	return c.PreferredUsername
}

// Authenticator verifies bearer tokens and produces middleware.
type Authenticator struct {
	verifier *oidc.IDTokenVerifier // nil => auth disabled
	enabled  bool
}

// New builds an Authenticator. If issuer is empty, auth is DISABLED (dev mode)
// and a clear warning is logged.
//
// discoveryURL is an optional internal URL to perform OIDC discovery / fetch the
// JWKS against (e.g. an in-cluster Keycloak Service), while issuer remains the
// public issuer that tokens actually carry in their `iss` claim. When they differ
// (typical behind a reverse proxy), discovery is done with InsecureIssuerURLContext
// so the mismatch is tolerated; signature/issuer validation still uses the public issuer.
//
// Discovery is retried with backoff so the backend can start before the identity
// provider is fully ready.
func New(ctx context.Context, issuer, discoveryURL, audience string) (*Authenticator, error) {
	if strings.TrimSpace(issuer) == "" {
		log.Println("WARNING: CRAFTVERSE_OIDC_ISSUER is empty — authentication is DISABLED. " +
			"All /api/* routes are open. Do NOT run like this in production.")
		return &Authenticator{enabled: false}, nil
	}

	discoverAt := issuer
	dctx := ctx
	if d := strings.TrimSpace(discoveryURL); d != "" && d != issuer {
		discoverAt = d
		// Tell go-oidc to expect `issuer` even though we fetch from discoverAt.
		dctx = oidc.InsecureIssuerURLContext(ctx, issuer)
	}

	provider, err := discoverWithRetry(dctx, discoverAt, 60*time.Second)
	if err != nil {
		return nil, err
	}
	cfg := &oidc.Config{ClientID: audience}
	if audience == "" {
		// No audience configured: skip the aud check but still verify signature/issuer.
		cfg.SkipClientIDCheck = true
	}
	return &Authenticator{
		verifier: provider.Verifier(cfg),
		enabled:  true,
	}, nil
}

// discoverWithRetry polls the OIDC discovery endpoint until it succeeds or the
// timeout elapses — so startup can race ahead of the identity provider.
func discoverWithRetry(ctx context.Context, discoveryURL string, timeout time.Duration) (*oidc.Provider, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for attempt := 1; ; attempt++ {
		provider, err := oidc.NewProvider(ctx, discoveryURL)
		if err == nil {
			return provider, nil
		}
		lastErr = err
		if time.Now().After(deadline) {
			return nil, lastErr
		}
		log.Printf("OIDC discovery not ready (attempt %d): %v — retrying in 2s", attempt, err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

// Enabled reports whether token verification is active.
func (a *Authenticator) Enabled() bool { return a.enabled }

// Middleware validates the Authorization bearer token on every request and
// stores the resulting User in the request context.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.enabled {
			// Dev mode: inject an anonymous user.
			ctx := context.WithValue(r.Context(), userCtxKey, User{Subject: "dev", DisplayName: "Dev User"})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		raw := bearerToken(r)
		if raw == "" {
			writeUnauthorized(w, "missing bearer token")
			return
		}
		tok, err := a.verifier.Verify(r.Context(), raw)
		if err != nil {
			writeUnauthorized(w, "invalid token")
			return
		}
		var c claims
		_ = tok.Claims(&c)
		u := User{Subject: tok.Subject, DisplayName: c.displayName()}
		ctx := context.WithValue(r.Context(), userCtxKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Optional behaves like Middleware but NEVER rejects the request: if a valid
// bearer token is present it injects the user into the context, otherwise the
// request proceeds anonymously. Used for public read routes — atlases are public,
// so viewing requires no login while writes still go through Middleware.
func (a *Authenticator) Optional(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.enabled {
			// Dev mode: inject an anonymous user.
			ctx := context.WithValue(r.Context(), userCtxKey, User{Subject: "dev", DisplayName: "Dev User"})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		if raw := bearerToken(r); raw != "" {
			if tok, err := a.verifier.Verify(r.Context(), raw); err == nil {
				var c claims
				_ = tok.Claims(&c)
				u := User{Subject: tok.Subject, DisplayName: c.displayName()}
				r = r.WithContext(context.WithValue(r.Context(), userCtxKey, u))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// FromContext returns the authenticated user, if any.
func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userCtxKey).(User)
	return u, ok
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", `Bearer`)
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":{"code":"unauthorized","message":"` + msg + `"}}`))
}
