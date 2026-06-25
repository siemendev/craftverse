// Package config loads service configuration from environment variables.
package config

import (
	"os"
	"strings"
)

// Config holds all runtime configuration for the Craftverse backend.
type Config struct {
	HTTPAddr         string   // CRAFTVERSE_HTTP_ADDR
	DBDSN            string   // CRAFTVERSE_DB_DSN
	OIDCIssuer       string   // CRAFTVERSE_OIDC_ISSUER (empty => auth disabled)
	OIDCDiscoveryURL string   // CRAFTVERSE_OIDC_DISCOVERY_URL (optional internal URL for discovery/JWKS; falls back to issuer)
	OIDCAudience     string   // CRAFTVERSE_OIDC_AUDIENCE
	CORSOrigins      []string // CRAFTVERSE_CORS_ORIGINS (comma separated)
}

// Load reads configuration from the environment, applying defaults.
func Load() Config {
	return Config{
		HTTPAddr:         getEnv("CRAFTVERSE_HTTP_ADDR", ":8080"),
		DBDSN:            os.Getenv("CRAFTVERSE_DB_DSN"),
		OIDCIssuer:       os.Getenv("CRAFTVERSE_OIDC_ISSUER"),
		OIDCDiscoveryURL: os.Getenv("CRAFTVERSE_OIDC_DISCOVERY_URL"),
		OIDCAudience:     os.Getenv("CRAFTVERSE_OIDC_AUDIENCE"),
		CORSOrigins:      splitAndTrim(os.Getenv("CRAFTVERSE_CORS_ORIGINS")),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitAndTrim(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
