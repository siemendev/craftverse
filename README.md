# Craftverse

Manage and explore crafting dependencies from games. Items are crafted from other items; a canvas
shows the dependency web, and a detail view shows the full recursive crafting tree. Each game's
crafting database is an **Atlas**.

See [`SPEC.md`](./SPEC.md) for the product spec and [`CONTRACTS.md`](./CONTRACTS.md) for the API/build contract.

## Stack

- **Backend:** Go (Chi, sqlc, go-sql-driver/mysql), REST/JSON
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui + React Flow
- **Database:** MariaDB (via the cluster's MariaDB operator)
- **Auth:** Keycloak (OIDC) — the whole app is behind login
- **Deploy:** GitHub Actions → Helm → Siemens.cloud cluster (namespace `craftverse`, Traefik ingress)

## Local development

```bash
cp .env.example .env       # adjust if needed
docker compose up --build  # Traefik + MariaDB + Keycloak + backend + frontend
```

Then open <http://craftverse.localhost>. Keycloak admin at <http://auth.localhost>.

## Layout

- `backend/` — Go service + migrations
- `frontend/` — React SPA
- `deploy/` — Helm umbrella chart + Keycloak realm
- `.github/workflows/` — CI/CD
