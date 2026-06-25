# syntax=docker/dockerfile:1

# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install deps with a clean, reproducible install.
COPY package.json package-lock.json* ./
RUN npm ci

# Build the SPA.
COPY . .
RUN npm run build

# ---- Runtime stage (nginx, arch-neutral) ----------------------------------
FROM nginx:1.27-alpine AS runtime

# SPA + arch-neutral nginx config (history fallback, no-cache for shell/config).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Entrypoint renders /config.js from env at container start so the same image
# works in any environment (falls back to build-time VITE_ vars otherwise).
COPY docker-entrypoint.sh /docker-entrypoint.d/40-craftverse-config.sh
RUN chmod +x /docker-entrypoint.d/40-craftverse-config.sh

EXPOSE 8080
# nginx:alpine's own entrypoint runs scripts in /docker-entrypoint.d then execs nginx.
