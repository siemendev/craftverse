# syntax=docker/dockerfile:1

# --- build stage ---
# Arch-neutral: CI passes --platform=linux/arm64. TARGETOS/TARGETARCH are set
# by buildx from the requested platform.
FROM --platform=$BUILDPLATFORM golang:1.25 AS build
WORKDIR /src

# Cache module downloads.
COPY go.mod go.sum ./
RUN go mod download

# Build a static binary (migrations are embedded via //go:embed).
COPY . .
ARG TARGETOS=linux
ARG TARGETARCH=arm64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w" -o /out/server ./cmd/server

# --- final stage ---
FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
# Same image runs the server (default) and `migrate up`:
#   docker run image                 -> starts HTTP server
#   docker run image migrate up      -> applies migrations
ENTRYPOINT ["/server"]
