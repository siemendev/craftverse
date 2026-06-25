package db

import (
	"context"
	"errors"
	"fmt"
	"io/fs"

	gomysql "github.com/go-sql-driver/mysql"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/mysql"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// MigrateUp applies all up migrations from the embedded FS against the DSN.
func MigrateUp(migrationsFS fs.FS, dsn string) error {
	m, err := newMigrator(migrationsFS, dsn)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

// MigrateDown rolls back all migrations.
func MigrateDown(migrationsFS fs.FS, dsn string) error {
	m, err := newMigrator(migrationsFS, dsn)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

func newMigrator(migrationsFS fs.FS, dsn string) (*migrate.Migrate, error) {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("iofs source: %w", err)
	}

	// golang-migrate's mysql driver needs a DSN without driver-specific
	// query params it doesn't understand; reuse the same DSN via a sql.DB.
	cfg, err := gomysql.ParseDSN(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	if cfg.Params == nil {
		cfg.Params = map[string]string{}
	}
	cfg.MultiStatements = true

	store, err := Open(context.Background(), cfg.FormatDSN())
	if err != nil {
		return nil, err
	}
	driver, err := mysql.WithInstance(store.DB(), &mysql.Config{})
	if err != nil {
		return nil, fmt.Errorf("mysql driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "mysql", driver)
	if err != nil {
		return nil, fmt.Errorf("migrate instance: %w", err)
	}
	return m, nil
}
