package db

import (
	"context"
	"database/sql"
	"errors"
)

// ListCurrencies returns all currencies for an atlas, the default first.
func (s *Store) ListCurrencies(ctx context.Context, atlasID uint64) ([]Currency, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, name, is_default FROM currency WHERE atlas_id = ? ORDER BY is_default DESC, name`, atlasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Currency
	for rows.Next() {
		var c Currency
		if err := rows.Scan(&c.ID, &c.AtlasID, &c.Name, &c.IsDefault); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCurrency returns a single currency or ErrNotFound.
func (s *Store) GetCurrency(ctx context.Context, id uint64) (Currency, error) {
	var c Currency
	err := s.db.QueryRowContext(ctx,
		`SELECT id, atlas_id, name, is_default FROM currency WHERE id = ?`, id).
		Scan(&c.ID, &c.AtlasID, &c.Name, &c.IsDefault)
	if errors.Is(err, sql.ErrNoRows) {
		return Currency{}, ErrNotFound
	}
	return c, err
}

// CreateCurrency inserts a currency. The first currency in an atlas always
// becomes the default; otherwise isDefault is honored (and clears any prior
// default).
func (s *Store) CreateCurrency(ctx context.Context, atlasID uint64, name string, isDefault bool) (Currency, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Currency{}, err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM currency WHERE atlas_id = ?`, atlasID).Scan(&count); err != nil {
		return Currency{}, err
	}
	if count == 0 {
		isDefault = true
	}
	if isDefault {
		if _, err := tx.ExecContext(ctx, `UPDATE currency SET is_default = FALSE WHERE atlas_id = ?`, atlasID); err != nil {
			return Currency{}, err
		}
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO currency (atlas_id, name, is_default) VALUES (?, ?, ?)`, atlasID, name, isDefault)
	if err != nil {
		return Currency{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Currency{}, err
	}
	if err := tx.Commit(); err != nil {
		return Currency{}, err
	}
	return s.GetCurrency(ctx, uint64(id))
}

// UpdateCurrency applies non-nil fields. Setting isDefault=true clears any other
// default in the same atlas.
func (s *Store) UpdateCurrency(ctx context.Context, id uint64, name *string, isDefault *bool) (Currency, error) {
	c, err := s.GetCurrency(ctx, id)
	if err != nil {
		return Currency{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Currency{}, err
	}
	defer tx.Rollback()

	if name != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE currency SET name = ? WHERE id = ?`, *name, id); err != nil {
			return Currency{}, err
		}
	}
	if isDefault != nil {
		if *isDefault {
			if _, err := tx.ExecContext(ctx, `UPDATE currency SET is_default = FALSE WHERE atlas_id = ?`, c.AtlasID); err != nil {
				return Currency{}, err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE currency SET is_default = TRUE WHERE id = ?`, id); err != nil {
				return Currency{}, err
			}
		} else {
			if _, err := tx.ExecContext(ctx, `UPDATE currency SET is_default = FALSE WHERE id = ?`, id); err != nil {
				return Currency{}, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return Currency{}, err
	}
	return s.GetCurrency(ctx, id)
}

// DeleteCurrency removes a currency (cascades to any prices using it). If the
// deleted currency was the default, the lowest-id remaining currency in the
// atlas is promoted so an atlas with currencies always has a default.
func (s *Store) DeleteCurrency(ctx context.Context, id uint64) error {
	c, err := s.GetCurrency(ctx, id)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM currency WHERE id = ?`, id); err != nil {
		return err
	}
	if c.IsDefault {
		var remaining int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM currency WHERE atlas_id = ?`, c.AtlasID).Scan(&remaining); err != nil {
			return err
		}
		if remaining > 0 {
			if _, err := tx.ExecContext(ctx, `UPDATE currency SET is_default = TRUE WHERE atlas_id = ? ORDER BY id LIMIT 1`, c.AtlasID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
