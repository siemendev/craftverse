package db

import (
	"context"
	"database/sql"
	"errors"
)

// --- Tags ---

// ListTags returns all tags for an atlas ordered by name.
func (s *Store) ListTags(ctx context.Context, atlasID uint64) ([]Tag, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, name, color FROM tag WHERE atlas_id = ? ORDER BY name`, atlasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.AtlasID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetTag returns a single tag.
func (s *Store) GetTag(ctx context.Context, id uint64) (Tag, error) {
	var t Tag
	err := s.db.QueryRowContext(ctx,
		`SELECT id, atlas_id, name, color FROM tag WHERE id = ?`, id).
		Scan(&t.ID, &t.AtlasID, &t.Name, &t.Color)
	if errors.Is(err, sql.ErrNoRows) {
		return Tag{}, ErrNotFound
	}
	return t, err
}

// CreateTag inserts a tag for an atlas.
func (s *Store) CreateTag(ctx context.Context, atlasID uint64, name string, color *string) (Tag, error) {
	return createTagExec(ctx, s.db, atlasID, name, color)
}

// --- Locations ---

// ListLocations returns all locations for an atlas ordered by name.
func (s *Store) ListLocations(ctx context.Context, atlasID uint64) ([]Location, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, name, description, address FROM location WHERE atlas_id = ? ORDER BY name`, atlasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Location
	for rows.Next() {
		var l Location
		if err := rows.Scan(&l.ID, &l.AtlasID, &l.Name, &l.Description, &l.Address); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// GetLocation returns a single location.
func (s *Store) GetLocation(ctx context.Context, id uint64) (Location, error) {
	var l Location
	err := s.db.QueryRowContext(ctx,
		`SELECT id, atlas_id, name, description, address FROM location WHERE id = ?`, id).
		Scan(&l.ID, &l.AtlasID, &l.Name, &l.Description, &l.Address)
	if errors.Is(err, sql.ErrNoRows) {
		return Location{}, ErrNotFound
	}
	return l, err
}

// CreateLocation inserts a location for an atlas.
func (s *Store) CreateLocation(ctx context.Context, atlasID uint64, name string) (Location, error) {
	return createLocationExec(ctx, s.db, atlasID, name)
}

// UpdateLocation replaces a location's editable fields. name must be non-empty;
// description and address are set verbatim (nil clears the column).
func (s *Store) UpdateLocation(ctx context.Context, id uint64, name string, description, address *string) (Location, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE location SET name = ?, description = ?, address = ? WHERE id = ?`,
		name, description, address, id)
	if err != nil {
		return Location{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// RowsAffected is 0 for both "no such row" and "no change"; disambiguate.
		if _, gerr := s.GetLocation(ctx, id); gerr != nil {
			return Location{}, gerr
		}
	}
	return s.GetLocation(ctx, id)
}

// LocationUsage counts the references that block deleting a location.
type LocationUsage struct {
	RecipeCount int
	PriceCount  int
}

// DeleteLocation removes a location, unless it is still referenced by a recipe
// or an item price. When referenced it returns the usage counts and does not
// delete, so the caller can surface a 409.
func (s *Store) DeleteLocation(ctx context.Context, id uint64) (LocationUsage, error) {
	if _, err := s.GetLocation(ctx, id); err != nil {
		return LocationUsage{}, err
	}
	var u LocationUsage
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM recipe_location WHERE location_id = ?`, id).
		Scan(&u.RecipeCount); err != nil {
		return LocationUsage{}, err
	}
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM item_price WHERE location_id = ?`, id).
		Scan(&u.PriceCount); err != nil {
		return LocationUsage{}, err
	}
	if u.RecipeCount > 0 || u.PriceCount > 0 {
		return u, nil
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM location WHERE id = ?`, id); err != nil {
		return LocationUsage{}, err
	}
	return LocationUsage{}, nil
}

// execer is satisfied by both *sql.DB and *sql.Tx.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func createTagExec(ctx context.Context, e execer, atlasID uint64, name string, color *string) (Tag, error) {
	res, err := e.ExecContext(ctx,
		`INSERT INTO tag (atlas_id, name, color) VALUES (?, ?, ?)`, atlasID, name, color)
	if err != nil {
		return Tag{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Tag{}, err
	}
	var t Tag
	err = e.QueryRowContext(ctx,
		`SELECT id, atlas_id, name, color FROM tag WHERE id = ?`, uint64(id)).
		Scan(&t.ID, &t.AtlasID, &t.Name, &t.Color)
	return t, err
}

func createLocationExec(ctx context.Context, e execer, atlasID uint64, name string) (Location, error) {
	res, err := e.ExecContext(ctx,
		`INSERT INTO location (atlas_id, name) VALUES (?, ?)`, atlasID, name)
	if err != nil {
		return Location{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Location{}, err
	}
	var l Location
	err = e.QueryRowContext(ctx,
		`SELECT id, atlas_id, name FROM location WHERE id = ?`, uint64(id)).
		Scan(&l.ID, &l.AtlasID, &l.Name)
	return l, err
}

// resolveTagNames returns existing tag ids for the given names in an atlas,
// creating any that do not exist. Used for on-the-fly tagNames.
func resolveTagNames(ctx context.Context, e execer, atlasID uint64, names []string) ([]uint64, error) {
	var ids []uint64
	for _, name := range names {
		if name == "" {
			continue
		}
		var id uint64
		err := e.QueryRowContext(ctx,
			`SELECT id FROM tag WHERE atlas_id = ? AND name = ?`, atlasID, name).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			t, cerr := createTagExec(ctx, e, atlasID, name, nil)
			if cerr != nil {
				return nil, cerr
			}
			id = t.ID
		} else if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// resolveLocationNames behaves like resolveTagNames for locations.
func resolveLocationNames(ctx context.Context, e execer, atlasID uint64, names []string) ([]uint64, error) {
	var ids []uint64
	for _, name := range names {
		if name == "" {
			continue
		}
		var id uint64
		err := e.QueryRowContext(ctx,
			`SELECT id FROM location WHERE atlas_id = ? AND name = ?`, atlasID, name).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			l, cerr := createLocationExec(ctx, e, atlasID, name)
			if cerr != nil {
				return nil, cerr
			}
			id = l.ID
		} else if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}
