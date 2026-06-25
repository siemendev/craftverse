# Craftverse

Web app to maintain and visually explore crafting dependencies from games. Items are crafted from
other items; a React Flow canvas shows the dependency web, a detail view renders the full recursive
crafting tree. Each game's crafting DB is an **Atlas**. The whole app sits behind a Keycloak login.

**Reference docs — do NOT read these by default.** The summary in this file is enough for most work.
Open them ONLY when the specific trigger applies, and read only the relevant section:
- `CONTRACTS.md` — the binding contract: exact REST routes, request/response DTOs, error codes, env
  vars, verified deployment facts. Read **only** when touching an API endpoint, a DTO shape, the auth
  flow, or the deploy/Helm config. **If you change any of those, update `CONTRACTS.md` in the same change.**
- `SPEC.md` — product spec, scope, data-model rationale, Phase 1 vs Phase 2. Read **only** when a
  request is ambiguous about intended behavior, or to confirm whether something is in scope for Phase 1.

## Architecture

- **Backend** (`backend/`): Go 1.25, Chi router, `database/sql` + `go-sql-driver/mysql`. All routes
  under `/api`. **Atlases are public**: `GET` routes (and `/api/healthz`) need no auth; only
  `POST`/`PATCH`/`DELETE` (editing) require a Bearer JWT validated against Keycloak JWKS.
  - `internal/api` — HTTP handlers + DTOs (`dto.go`, `respond.go`).
  - `internal/db` — hand-written data access (one file per aggregate).
  - `internal/tree` — recursive crafting-tree resolution (cycle tracking + `maxDepth`); has the
    main unit tests (`tree_test.go`).
  - `internal/auth`, `internal/config` — OIDC validation, env config.
  - `migrations/*.sql` (golang-migrate) are **embedded** via `migrations.go`; the same binary serves
    HTTP and runs migrations. Add `NNNN_name.up.sql` + `.down.sql` pairs.
- **Frontend** (`frontend/`): React 19 + TS + Vite + Tailwind + shadcn/ui, React Flow (`@xyflow/react`)
  for the canvas, dagre for layout, `react-oidc-context` for auth, `react-router-dom`.
  - `src/api` — typed REST client (`client.ts`) + `types.ts` (mirror of `CONTRACTS.md` DTOs).
  - `src/features/{atlas,canvas,items,layout}` — feature folders. `src/components/ui` — shadcn primitives.

## Conventions (don't break these — see CONTRACTS.md)

- DB IDs are `uint64`, **serialized in JSON as strings** (avoid JS 53-bit precision loss).
- JSON is camelCase; timestamps are RFC3339 strings (`createdAt`, `updatedAt`).
- HTTP errors: `{ "error": { "code", "message", "details" } }`. Blocked deletes return `409` with a
  usage list (`item_in_use` / `ambiguous_recipe`).
- A raw material = an item with no recipe (no flag). Tags & locations are atlas-scoped.
- `sqlc.yaml` + `queries/` are **documentation only** — the `internal/db` layer is hand-written so
  `go build` needs no codegen. sqlc is not run in CI.

## Commands

Local stack (Traefik + MariaDB + Keycloak + backend + frontend), via root `Makefile`:

```bash
make up        # docker compose up -d --build  → http://craftverse.localhost, auth at http://auth.localhost
make down      # down -v (removes volumes)
make logs      # tail all services
make ps
```

Backend (`cd backend`): hot reload with `air`; `go build ./...`, `go test ./...`, `go vet ./...`.
Frontend (`cd frontend`): `npm run dev`, `npm run build` (`tsc -b && vite build`),
`npm run typecheck`, `npm run lint`.

Helm: `make helm-lint` / `make helm-template` (both run `sync-realm` first to copy the canonical
`deploy/keycloak/realm-export.json` into the chart).

## Deploy

Push to `main` → GitHub Actions builds backend+frontend images for **linux/arm64** (cluster nodes are
ARM64), pushes to `ghcr.io/siemendev/craftverse`, then `helm upgrade --install` into namespace
`craftverse` on the `admin@siemen.cloud` cluster. Ingress is Traefik; TLS via cert-manager
(`cloudflare-issuer`). Deployment facts in `CONTRACTS.md` are verified against the cluster — re-check
before changing them. Reference implementation to mirror: `~/Documents/private/dzbot`.
