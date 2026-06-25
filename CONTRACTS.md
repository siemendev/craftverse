# Craftverse — Build Contracts (single source of truth for all components)

This file pins down the directory layout, REST API, auth, env vars, naming, and the verified
deployment facts. Backend, frontend, and infra are built against THIS document so they fit together.
Read together with `SPEC.md` (the product spec).

## Repository layout

```
craftverse/
  backend/                 # Go service
    cmd/server/main.go
    internal/{api,db,auth,tree,config}/
    migrations/*.sql        # golang-migrate (0001_init.up.sql already exists)
    sqlc.yaml
    queries/*.sql           # sqlc query sources
    go.mod
    Dockerfile
    .air.toml               # hot reload for local dev
  frontend/                # React + TS + Vite + Tailwind + shadcn/ui
    src/
    index.html
    package.json
    vite.config.ts
    Dockerfile
    nginx.conf              # for the production image (static serve)
  deploy/
    helm/craftverse/        # umbrella chart
      Chart.yaml
      values.yaml
      templates/
    keycloak/realm-export.json
  .github/workflows/deploy.yml
  docker-compose.yml        # local dev (Traefik + mariadb + keycloak + backend + frontend)
  traefik/                  # local Traefik dynamic config if needed
  .env.example
  SPEC.md
  CONTRACTS.md
  README.md
```

## Naming & conventions

- Module path: `github.com/siemendev/craftverse/backend`.
- IDs are `uint64`, serialized in JSON as **strings** (avoid JS 53-bit precision loss). Field name `id`.
- JSON: camelCase. Timestamps: RFC3339 strings (`createdAt`, `updatedAt`).
- All API routes under `/api`. Health check at `/api/healthz` (no auth).
- HTTP errors: JSON `{ "error": { "code": "string", "message": "human readable", "details": {...} } }`.

## Auth

- OIDC via Keycloak. **Atlases are public**: all read routes (the `GET` endpoints below) are open and
  require no token. Only **write** routes (`POST`/`PATCH`/`DELETE`) require a valid Bearer JWT — login
  unlocks editing, not viewing. `/api/healthz` is open too.
  - Read routes use an **optional** auth middleware: a valid token is honored if present but absent or
    invalid tokens still pass through (read-only). Write routes use the enforcing middleware → `401`
    with `{code:"unauthorized"}` when the token is missing or invalid.
- Backend validates the JWT signature against Keycloak's JWKS (`{issuer}/protocol/openid-connect/certs`),
  checks `iss` and `aud`/`azp`. No per-user authorization in Phase 1 (any authenticated user may do anything;
  no per-atlas visibility / access management — that is out of scope for now).
- Display name comes from token claims (`name` or `given_name`+`family_name`, fallback `preferred_username`).
- Keycloak realm: `craftverse`. Public client (SPA, Authorization Code + PKCE): `craftverse-web`.
  Backend audience/client id it accepts: `craftverse-web` (and/or `account`). Token `azp` = `craftverse-web`.

## Environment variables (backend)

| Var | Example (local) | Meaning |
|-----|-----------------|---------|
| `CRAFTVERSE_HTTP_ADDR` | `:8080` | listen address |
| `CRAFTVERSE_DB_DSN` | `app:app@tcp(mariadb:3306)/craftverse?parseTime=true&loc=UTC` | MariaDB DSN (go-sql-driver/mysql) |
| `CRAFTVERSE_OIDC_ISSUER` | `http://keycloak:8080/realms/craftverse` | Keycloak realm issuer URL |
| `CRAFTVERSE_OIDC_AUDIENCE` | `craftverse-web` | expected audience/azp |
| `CRAFTVERSE_CORS_ORIGINS` | `http://craftverse.localhost` | allowed origins (comma-sep) |

Frontend (Vite, `VITE_` prefix, injected at build or runtime via `/config.js`):
`VITE_API_BASE_URL` (default `/api`), `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID=craftverse-web`,
`VITE_OIDC_REDIRECT_URI`.

## REST API

All paths prefixed `/api`. IDs are strings. `409 Conflict` carries a usage list for blocked deletes.
**All `GET` routes are public (no auth); all `POST`/`PATCH`/`DELETE` routes require a valid Bearer JWT (`401` otherwise).**

### Health
- `GET /api/healthz` → `200 {"status":"ok"}` (no auth)

### Atlases
- `GET /api/atlases` → `[Atlas]`
- `POST /api/atlases` body `{name, description?}` → `201 Atlas`
- `GET /api/atlases/{id}` → `Atlas`
- `PATCH /api/atlases/{id}` body `{name?, description?}` → `Atlas`
- `DELETE /api/atlases/{id}` → `204` (cascades to all contents)

### Graph (canvas payload for one atlas)
- `GET /api/atlases/{id}/graph` → `Graph`
  ```jsonc
  {
    "atlas": Atlas,
    "items": [ItemSummary],          // id, name, tags[], isRaw (no recipes), locationIds[] (union over its recipes)
    "locations": [Location],
    "edges": [                       // one per recipe_ingredient: ingredient -> output item
      { "id": "ri:<id>", "recipeId": "..", "fromItemId": "..", "toItemId": "..", "quantity": 3 }
    ],
    "recipes": [RecipeSummary]       // id, outputItemId, isPrimary, locationIds[]
  }
  ```
  The frontend computes the cluster-by-location layout from this single payload (dagre/ELK client-side).

### Items
- `GET /api/atlases/{id}/items` → `[Item]`
- `POST /api/atlases/{id}/items` body `{name, notes?, tagIds?:[], tagNames?:[]}` → `201 Item`
  (tagNames create tags on the fly within the atlas)
- `GET /api/items/{id}` → `ItemDetail` (item + its recipes with ingredients & locations + its buy/sell prices)
- `PATCH /api/items/{id}` body `{name?, notes?, tagIds?, tagNames?}` → `Item`
- `DELETE /api/items/{id}` → `204`; if used as an ingredient elsewhere → `409` with
  `{ "error": { "code": "item_in_use", "details": { "usedIn": [ {recipeId, outputItemId, outputItemName} ] } } }`
- `DELETE /api/items/{id}?force=true` → `204`, removes the referencing `recipe_ingredient` rows first, then the item.
- `GET /api/items/{id}/tree?maxDepth=` → `TreeNode` — recursive crafting tree (see below)
- `PATCH /api/items/{id}/prices` body `{prices:[{kind:"buy"|"sell", locationId, currencyId, amount}]}` → `ItemDetail`
  - Replaces the **full** set of prices for the item (both buy and sell). `kind` is `buy` (Einkauf/EK) or
    `sell` (Verkauf/VK). `locationId` and `currencyId` are atlas-scoped relations; `amount` is a non-negative
    integer. `locationName` is also accepted in place of `locationId` (created on the fly). Rows with an
    invalid kind, or missing location/currency, are skipped.

### Recipes
- `POST /api/items/{id}/recipes` body `{isPrimary?, ingredients:[{itemId, quantity}], locationIds?:[], locationNames?:[]}` → `201 Recipe`
  - Edge-drag shortcut: `POST /api/recipes/ingredient` body `{outputItemId, ingredientItemId, quantity?}` →
    adds ingredient to the output item's single recipe; creates a recipe if none; if multiple recipes exist,
    returns `409 {code:"ambiguous_recipe", details:{recipeIds:[...]}}` so the UI prompts which recipe.
- `PATCH /api/recipes/{id}` body `{isPrimary?, ingredients?, locationIds?, locationNames?}` → `Recipe` (replaces given sets)
- `DELETE /api/recipes/{id}` → `204`

### Locations & Tags (atlas-scoped, on-the-fly creation supported)
- `GET /api/atlases/{id}/locations` → `[Location]`
- `POST /api/atlases/{id}/locations` body `{name}` → `201 Location`
- `GET /api/locations/{id}` → `Location` (public)
- `PATCH /api/locations/{id}` body `{name, description?, address?}` → `Location` (full replace of the
  editable fields; empty/blank `description`/`address` clears the column to null)
- `DELETE /api/locations/{id}` → `204`, or `409 location_in_use` with
  `details:{recipeCount, priceCount}` when the location is still referenced (no force; remove the
  references first)
- `GET /api/atlases/{id}/tags` → `[Tag]`
- `POST /api/atlases/{id}/tags` body `{name, color?}` → `201 Tag`

### Currencies (atlas-scoped; exactly one default per atlas)
- `GET /api/atlases/{id}/currencies` → `[Currency]` (default first, then by name)
- `POST /api/atlases/{id}/currencies` body `{name, isDefault?}` → `201 Currency`
  - The first currency in an atlas always becomes the default. Setting `isDefault:true` clears any prior default.
- `PATCH /api/currencies/{id}` body `{name?, isDefault?}` → `Currency` (setting `isDefault:true` clears the others)
- `DELETE /api/currencies/{id}` → `204` (cascades to prices using it; if the default is removed, the
  lowest-id remaining currency is promoted so an atlas with currencies always has a default)

### DTOs
```jsonc
Atlas        { id, name, description?, createdAt, updatedAt }
Tag          { id, atlasId, name, color? }
Location     { id, atlasId, name, description?, address? }   // description/address nullable
Currency     { id, atlasId, name, isDefault:bool }
Price        { id, kind:"buy"|"sell", locationId, locationName, currencyId, currencyName, amount:int }
ItemSummary  { id, name, tags:[Tag], isRaw:bool, locationIds:[string] }
Item         { id, atlasId, name, notes?, tags:[Tag], createdAt, updatedAt }
RecipeSummary{ id, outputItemId, isPrimary, locationIds:[string] }
Recipe       { id, outputItemId, isPrimary, ingredients:[{ id, itemId, itemName, quantity }],
               locations:[Location] }
ItemDetail   { ...Item, recipes:[Recipe], prices:[Price] }
TreeNode     { itemId, itemName, quantity,            // quantity = per this edge (root quantity = 1)
               isRaw:bool,
               recipes:[ {                            // OR-branches; empty for raw items
                   recipeId, isPrimary, locations:[Location],
                   ingredients:[TreeNode]
               } ],
               cyclic:bool }                          // true => already visited on this path; children omitted
```

### Tree resolution rules (backend, `internal/tree`)
- Recursive over `recipe`/`recipe_ingredient`. Multiple recipes => multiple OR-branches under `recipes[]`.
- **Cycles allowed**: track visited item ids on the current path; on revisit set `cyclic:true` and stop
  (no children). Guarantees termination. Also honor `maxDepth` as a safety cap.
- No aggregation in Phase 1 (per-edge quantities only; totals are Phase 2).

## Deployment facts (VERIFIED against the cluster — do not change without re-checking)

- Cluster/context: `admin@siemen.cloud`. Target **namespace: `craftverse`** (does not exist yet → `--create-namespace`).
- **Node arch: ARM64.** Build images for `linux/arm64`. CI runner: `ubuntu-24.04-arm`.
- Registry: **`ghcr.io/siemendev/craftverse`**; images `backend` and `frontend`, tags `:<git-sha>` and `:latest`.
- Image pull: make the ghcr packages public, OR provide `imagePullSecrets` (chart supports optional `imagePullSecrets`).
- **MariaDB operator** `k8s.mariadb.com/v1alpha1` present: use `MariaDB`, `Database`, `User`, `Grant` CRs.
  One MariaDB instance, two databases: `craftverse` + `keycloak`. StorageClass `local-path` (default).
- **Ingress: Traefik** (`ingressClassName: traefik`, controller `traefik.io/ingress-controller`).
- **TLS: cert-manager** `Certificate` (`cert-manager.io/v1`) via ClusterIssuer **`cloudflare-issuer`**.
- Hosts (default, configurable in values): app `craftverse.siemen.cloud`, Keycloak `auth.craftverse.siemen.cloud`.
- CI deploy: kubeconfig from `secrets.KUBECONFIG` (base64), then
  `helm upgrade --install craftverse deploy/helm/craftverse --namespace craftverse --create-namespace
   --set-string registry=ghcr.io/siemendev/craftverse --set-string backendImageTag=$SHA --set-string frontendImageTag=$SHA`.
- Reference implementation to mirror: `/Users/patricksiemen/Documents/private/dzbot` (helm chart `k8s/dzbot`,
  workflows `.github/workflows/api.yaml` + `_build-api.yaml`).

## Local dev (docker-compose + Traefik)

- Hosts via Traefik labels: `craftverse.localhost` → frontend (Vite dev server, HMR),
  `craftverse.localhost/api` → backend, `auth.localhost` → keycloak. mariadb internal only.
- One MariaDB with both DBs created via init SQL. Keycloak in dev mode importing `deploy/keycloak/realm-export.json`.
- Backend hot reload via `air`. `make up` / `docker compose up` brings the whole stack.
