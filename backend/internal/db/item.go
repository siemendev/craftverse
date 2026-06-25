package db

import (
	"context"
	"database/sql"
	"errors"
)

// ListItems returns all items in an atlas ordered by name.
func (s *Store) ListItems(ctx context.Context, atlasID uint64) ([]Item, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, name, notes, created_at, updated_at FROM item WHERE atlas_id = ? ORDER BY name`, atlasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.AtlasID, &it.Name, &it.Notes, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetItem returns a single item or ErrNotFound.
func (s *Store) GetItem(ctx context.Context, id uint64) (Item, error) {
	var it Item
	err := s.db.QueryRowContext(ctx,
		`SELECT id, atlas_id, name, notes, created_at, updated_at FROM item WHERE id = ?`, id).
		Scan(&it.ID, &it.AtlasID, &it.Name, &it.Notes, &it.CreatedAt, &it.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	return it, err
}

// CreateItem inserts an item and attaches tags (by id and by name) in a tx.
func (s *Store) CreateItem(ctx context.Context, atlasID uint64, name string, notes *string, tagIDs []uint64, tagNames []string) (Item, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx,
		`INSERT INTO item (atlas_id, name, notes) VALUES (?, ?, ?)`, atlasID, name, notes)
	if err != nil {
		return Item{}, err
	}
	idI, err := res.LastInsertId()
	if err != nil {
		return Item{}, err
	}
	itemID := uint64(idI)

	allTagIDs, err := mergeTagIDs(ctx, tx, atlasID, tagIDs, tagNames)
	if err != nil {
		return Item{}, err
	}
	if err := attachTags(ctx, tx, itemID, allTagIDs); err != nil {
		return Item{}, err
	}
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return s.GetItem(ctx, itemID)
}

// UpdateItem applies non-nil fields. If tagIDs or tagNames is non-nil the tag
// set is replaced with the union of resolved ids.
func (s *Store) UpdateItem(ctx context.Context, id uint64, name, notes *string, tagIDs *[]uint64, tagNames *[]string) (Item, error) {
	it, err := s.GetItem(ctx, id)
	if err != nil {
		return Item{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback()

	if name != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE item SET name = ? WHERE id = ?`, *name, id); err != nil {
			return Item{}, err
		}
	}
	if notes != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE item SET notes = ? WHERE id = ?`, *notes, id); err != nil {
			return Item{}, err
		}
	}
	if tagIDs != nil || tagNames != nil {
		var ids []uint64
		var names []string
		if tagIDs != nil {
			ids = *tagIDs
		}
		if tagNames != nil {
			names = *tagNames
		}
		merged, err := mergeTagIDs(ctx, tx, it.AtlasID, ids, names)
		if err != nil {
			return Item{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM item_tag WHERE item_id = ?`, id); err != nil {
			return Item{}, err
		}
		if err := attachTags(ctx, tx, id, merged); err != nil {
			return Item{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Item{}, err
	}
	return s.GetItem(ctx, id)
}

// ItemUsages returns the recipes (with output item) that use the item as an
// ingredient.
func (s *Store) ItemUsages(ctx context.Context, itemID uint64) ([]Usage, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id, r.output_item_id, oi.name
		FROM recipe_ingredient ri
		JOIN recipe r ON r.id = ri.recipe_id
		JOIN item oi ON oi.id = r.output_item_id
		WHERE ri.item_id = ?
		ORDER BY oi.name`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Usage
	for rows.Next() {
		var u Usage
		if err := rows.Scan(&u.RecipeID, &u.OutputItemID, &u.OutputItemName); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// DeleteItem deletes an item. If force is false and the item is used as an
// ingredient, it returns the usages and does NOT delete. If force is true the
// referencing recipe_ingredient rows are removed first within a transaction.
func (s *Store) DeleteItem(ctx context.Context, id uint64, force bool) (usages []Usage, err error) {
	if _, gerr := s.GetItem(ctx, id); gerr != nil {
		return nil, gerr
	}
	usages, err = s.ItemUsages(ctx, id)
	if err != nil {
		return nil, err
	}
	if len(usages) > 0 && !force {
		return usages, nil // caller turns this into 409
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if force && len(usages) > 0 {
		if _, err = tx.ExecContext(ctx, `DELETE FROM recipe_ingredient WHERE item_id = ?`, id); err != nil {
			return nil, err
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM item WHERE id = ?`, id); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return nil, nil
}

// --- tag helpers ---

// TagsForItem returns the tags attached to an item.
func (s *Store) TagsForItem(ctx context.Context, itemID uint64) ([]Tag, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.atlas_id, t.name, t.color
		FROM item_tag it JOIN tag t ON t.id = it.tag_id
		WHERE it.item_id = ? ORDER BY t.name`, itemID)
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

// TagsForItems returns a map of itemID -> tags for a set of items (graph use).
func (s *Store) TagsForItems(ctx context.Context, atlasID uint64) (map[uint64][]Tag, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT it.item_id, t.id, t.atlas_id, t.name, t.color
		FROM item_tag it
		JOIN tag t ON t.id = it.tag_id
		WHERE t.atlas_id = ?
		ORDER BY t.name`, atlasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uint64][]Tag{}
	for rows.Next() {
		var itemID uint64
		var t Tag
		if err := rows.Scan(&itemID, &t.ID, &t.AtlasID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		out[itemID] = append(out[itemID], t)
	}
	return out, rows.Err()
}

func mergeTagIDs(ctx context.Context, e execer, atlasID uint64, tagIDs []uint64, tagNames []string) ([]uint64, error) {
	seen := map[uint64]bool{}
	var out []uint64
	for _, id := range tagIDs {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	nameIDs, err := resolveTagNames(ctx, e, atlasID, tagNames)
	if err != nil {
		return nil, err
	}
	for _, id := range nameIDs {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out, nil
}

func attachTags(ctx context.Context, e execer, itemID uint64, tagIDs []uint64) error {
	for _, tid := range tagIDs {
		if _, err := e.ExecContext(ctx,
			`INSERT IGNORE INTO item_tag (item_id, tag_id) VALUES (?, ?)`, itemID, tid); err != nil {
			return err
		}
	}
	return nil
}
