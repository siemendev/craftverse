// Command server is the Craftverse backend HTTP service. With no arguments it
// starts the HTTP server. The "migrate up" / "migrate down" subcommands run
// database migrations against CRAFTVERSE_DB_DSN using the embedded migrations.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	backend "github.com/siemendev/craftverse/backend"
	"github.com/siemendev/craftverse/backend/internal/api"
	"github.com/siemendev/craftverse/backend/internal/auth"
	"github.com/siemendev/craftverse/backend/internal/config"
	"github.com/siemendev/craftverse/backend/internal/db"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run(args []string) error {
	cfg := config.Load()

	// Subcommands: server migrate up|down
	if len(args) > 0 && args[0] == "migrate" {
		return runMigrate(args[1:], cfg)
	}
	return runServer(cfg)
}

func runMigrate(args []string, cfg config.Config) error {
	if len(args) == 0 {
		return errors.New("usage: server migrate up|down")
	}
	switch args[0] {
	case "up":
		log.Println("running migrations: up")
		if err := db.MigrateUp(backend.Migrations, cfg.DBDSN); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
		log.Println("migrations applied")
		return nil
	case "down":
		log.Println("running migrations: down")
		if err := db.MigrateDown(backend.Migrations, cfg.DBDSN); err != nil {
			return fmt.Errorf("migrate down: %w", err)
		}
		log.Println("migrations rolled back")
		return nil
	default:
		return fmt.Errorf("unknown migrate subcommand %q (want up|down)", args[0])
	}
}

func runServer(cfg config.Config) error {
	ctx := context.Background()

	store, err := db.Open(ctx, cfg.DBDSN)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer store.Close()

	authn, err := auth.New(ctx, cfg.OIDCIssuer, cfg.OIDCDiscoveryURL, cfg.OIDCAudience)
	if err != nil {
		return fmt.Errorf("init auth: %w", err)
	}

	handler := api.New(store, authn).Router(cfg.CORSOrigins)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown.
	idleClosed := make(chan struct{})
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
		<-sigCh
		log.Println("shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown error: %v", err)
		}
		close(idleClosed)
	}()

	log.Printf("Craftverse backend listening on %s (auth enabled: %v)", cfg.HTTPAddr, authn.Enabled())
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("http server: %w", err)
	}
	<-idleClosed
	return nil
}
