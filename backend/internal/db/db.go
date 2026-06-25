// Package db is the hand-written data-access layer over MariaDB using
// database/sql and the go-sql-driver/mysql driver. No code generation is
// required to build it.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// Store holds the database handle and exposes repository methods.
type Store struct {
	db *sql.DB
}

// Open connects to MariaDB using the given DSN and verifies connectivity.
func Open(ctx context.Context, dsn string) (*Store, error) {
	if dsn == "" {
		return nil, errors.New("empty DB DSN")
	}
	sqlDB, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(10)

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(pingCtx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &Store{db: sqlDB}, nil
}

// Close releases the underlying connection pool.
func (s *Store) Close() error { return s.db.Close() }

// DB exposes the underlying *sql.DB (e.g. for health checks).
func (s *Store) DB() *sql.DB { return s.db }
