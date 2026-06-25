package db

import (
	"context"
	"database/sql"
	"errors"
)

// ListAtlases returns all atlases ordered by name.
func (s *Store) ListAtlases(ctx context.Context) ([]Atlas, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, description, created_at, updated_at FROM atlas ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Atlas
	for rows.Next() {
		var a Atlas
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetAtlas returns one atlas or ErrNotFound.
func (s *Store) GetAtlas(ctx context.Context, id uint64) (Atlas, error) {
	var a Atlas
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, created_at, updated_at FROM atlas WHERE id = ?`, id).
		Scan(&a.ID, &a.Name, &a.Description, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Atlas{}, ErrNotFound
	}
	return a, err
}

// CreateAtlas inserts a new atlas and returns it.
func (s *Store) CreateAtlas(ctx context.Context, name string, description *string) (Atlas, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO atlas (name, description) VALUES (?, ?)`, name, description)
	if err != nil {
		return Atlas{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Atlas{}, err
	}
	return s.GetAtlas(ctx, uint64(id))
}

// UpdateAtlas applies the given non-nil fields and returns the updated atlas.
func (s *Store) UpdateAtlas(ctx context.Context, id uint64, name, description *string) (Atlas, error) {
	if name != nil {
		if _, err := s.db.ExecContext(ctx, `UPDATE atlas SET name = ? WHERE id = ?`, *name, id); err != nil {
			return Atlas{}, err
		}
	}
	if description != nil {
		if _, err := s.db.ExecContext(ctx, `UPDATE atlas SET description = ? WHERE id = ?`, *description, id); err != nil {
			return Atlas{}, err
		}
	}
	return s.GetAtlas(ctx, id)
}

// DeleteAtlas removes an atlas (cascades to all contents). Returns ErrNotFound
// if no row was affected.
func (s *Store) DeleteAtlas(ctx context.Context, id uint64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM atlas WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
