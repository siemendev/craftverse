# Craftverse — dev & deploy helpers.
.DEFAULT_GOAL := help

COMPOSE        ?= docker compose
CHART          := deploy/helm/craftverse
NAMESPACE      := craftverse
REALM_SRC      := deploy/keycloak/realm-export.json
REALM_CHART    := $(CHART)/files/realm-export.json
SEED_SQL       := deploy/seed/seed.sql
DB_NAME        := craftverse
DB_USER        ?= app
DB_PASS        ?= app

.PHONY: help up down logs ps build seed sync-realm helm-lint helm-template

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the local dev stack (Traefik + mariadb + keycloak + backend + frontend)
	$(COMPOSE) up -d --build

down: ## Stop the local dev stack and remove volumes
	$(COMPOSE) down -v

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

build: ## Build local images
	$(COMPOSE) build

seed: ## Load reproducible demo data into the local DB (replaces all data)
	$(COMPOSE) exec -T mariadb mariadb -u$(DB_USER) -p$(DB_PASS) $(DB_NAME) < $(SEED_SQL)
	@echo "Seeded $(DB_NAME) from $(SEED_SQL)"

sync-realm: ## Copy the canonical realm-export.json into the chart's files/ dir
	cp $(REALM_SRC) $(REALM_CHART)
	@echo "Synced $(REALM_SRC) -> $(REALM_CHART)"

helm-lint: sync-realm ## Lint the Helm chart
	helm lint $(CHART)

helm-template: sync-realm ## Render the Helm chart
	helm template craftverse $(CHART) --namespace $(NAMESPACE)
