package db

import (
	"context"
	"database/sql"
	"errors"
)

// ErrAmbiguousRecipe is returned by AddIngredientEdge when the output item has
// more than one recipe (the caller must pick one).
var ErrAmbiguousRecipe = errors.New("ambiguous recipe")

// AmbiguousRecipeError carries the candidate recipe ids.
type AmbiguousRecipeError struct {
	RecipeIDs []uint64
}

func (e *AmbiguousRecipeError) Error() string { return "ambiguous recipe" }

// GetRecipe returns the recipe row.
func (s *Store) GetRecipe(ctx context.Context, id uint64) (Recipe, error) {
	var r Recipe
	err := s.db.QueryRowContext(ctx,
		`SELECT id, atlas_id, output_item_id, is_primary, created_at, updated_at FROM recipe WHERE id = ?`, id).
		Scan(&r.ID, &r.AtlasID, &r.OutputItemID, &r.IsPrimary, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Recipe{}, ErrNotFound
	}
	return r, err
}

// RecipesForItem returns the recipe rows whose output is the given item.
func (s *Store) RecipesForItem(ctx context.Context, outputItemID uint64) ([]Recipe, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, output_item_id, is_primary, created_at, updated_at
		 FROM recipe WHERE output_item_id = ? ORDER BY is_primary DESC, id`, outputItemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Recipe
	for rows.Next() {
		var r Recipe
		if err := rows.Scan(&r.ID, &r.AtlasID, &r.OutputItemID, &r.IsPrimary, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// IngredientsForRecipe returns the ingredients (with item names) of a recipe.
func (s *Store) IngredientsForRecipe(ctx context.Context, recipeID uint64) ([]Ingredient, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ri.id, ri.recipe_id, ri.item_id, i.name, ri.quantity
		FROM recipe_ingredient ri JOIN item i ON i.id = ri.item_id
		WHERE ri.recipe_id = ? ORDER BY i.name`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Ingredient
	for rows.Next() {
		var in Ingredient
		if err := rows.Scan(&in.ID, &in.RecipeID, &in.ItemID, &in.ItemName, &in.Quantity); err != nil {
			return nil, err
		}
		out = append(out, in)
	}
	return out, rows.Err()
}

// LocationsForRecipe returns the locations attached to a recipe.
func (s *Store) LocationsForRecipe(ctx context.Context, recipeID uint64) ([]Location, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT l.id, l.atlas_id, l.name
		FROM recipe_location rl JOIN location l ON l.id = rl.location_id
		WHERE rl.recipe_id = ? ORDER BY l.name`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Location
	for rows.Next() {
		var l Location
		if err := rows.Scan(&l.ID, &l.AtlasID, &l.Name); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// IngredientInput is one ingredient row in a create/update request.
type IngredientInput struct {
	ItemID   uint64
	Quantity int
}

// CreateRecipe inserts a recipe for an output item along with ingredients and
// locations (by id and by name).
func (s *Store) CreateRecipe(ctx context.Context, outputItemID uint64, isPrimary bool, ingredients []IngredientInput, locationIDs []uint64, locationNames []string) (Recipe, error) {
	item, err := s.GetItem(ctx, outputItemID)
	if err != nil {
		return Recipe{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx,
		`INSERT INTO recipe (atlas_id, output_item_id, is_primary) VALUES (?, ?, ?)`,
		item.AtlasID, outputItemID, isPrimary)
	if err != nil {
		return Recipe{}, err
	}
	idI, err := res.LastInsertId()
	if err != nil {
		return Recipe{}, err
	}
	recipeID := uint64(idI)

	if err := replaceIngredients(ctx, tx, recipeID, ingredients); err != nil {
		return Recipe{}, err
	}
	if err := replaceLocations(ctx, tx, item.AtlasID, recipeID, locationIDs, locationNames); err != nil {
		return Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return Recipe{}, err
	}
	return s.GetRecipe(ctx, recipeID)
}

// UpdateRecipe replaces the given sets (only the non-nil ones).
func (s *Store) UpdateRecipe(ctx context.Context, id uint64, isPrimary *bool, ingredients *[]IngredientInput, locationIDs *[]uint64, locationNames *[]string) (Recipe, error) {
	r, err := s.GetRecipe(ctx, id)
	if err != nil {
		return Recipe{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback()

	if isPrimary != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE recipe SET is_primary = ? WHERE id = ?`, *isPrimary, id); err != nil {
			return Recipe{}, err
		}
	}
	if ingredients != nil {
		if err := replaceIngredients(ctx, tx, id, *ingredients); err != nil {
			return Recipe{}, err
		}
	}
	if locationIDs != nil || locationNames != nil {
		var lids []uint64
		var lnames []string
		if locationIDs != nil {
			lids = *locationIDs
		}
		if locationNames != nil {
			lnames = *locationNames
		}
		if err := replaceLocations(ctx, tx, r.AtlasID, id, lids, lnames); err != nil {
			return Recipe{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Recipe{}, err
	}
	return s.GetRecipe(ctx, id)
}

// DeleteRecipe removes a recipe (cascades ingredients/locations).
func (s *Store) DeleteRecipe(ctx context.Context, id uint64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM recipe WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// AddIngredientEdge implements the edge-drag shortcut: add ingredientItemID to
// outputItemID's single recipe, creating a recipe if none exists. If multiple
// recipes exist it returns an *AmbiguousRecipeError.
func (s *Store) AddIngredientEdge(ctx context.Context, outputItemID, ingredientItemID uint64, quantity int) (Recipe, error) {
	if quantity <= 0 {
		quantity = 1
	}
	item, err := s.GetItem(ctx, outputItemID)
	if err != nil {
		return Recipe{}, err
	}
	if _, err := s.GetItem(ctx, ingredientItemID); err != nil {
		return Recipe{}, err
	}
	recipes, err := s.RecipesForItem(ctx, outputItemID)
	if err != nil {
		return Recipe{}, err
	}
	if len(recipes) > 1 {
		ids := make([]uint64, len(recipes))
		for i, r := range recipes {
			ids[i] = r.ID
		}
		return Recipe{}, &AmbiguousRecipeError{RecipeIDs: ids}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback()

	var recipeID uint64
	if len(recipes) == 0 {
		res, err := tx.ExecContext(ctx,
			`INSERT INTO recipe (atlas_id, output_item_id, is_primary) VALUES (?, ?, ?)`,
			item.AtlasID, outputItemID, false)
		if err != nil {
			return Recipe{}, err
		}
		idI, err := res.LastInsertId()
		if err != nil {
			return Recipe{}, err
		}
		recipeID = uint64(idI)
	} else {
		recipeID = recipes[0].ID
	}

	// Upsert the ingredient: on duplicate (recipe_id, item_id) bump quantity.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO recipe_ingredient (recipe_id, item_id, quantity) VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
		recipeID, ingredientItemID, quantity); err != nil {
		return Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return Recipe{}, err
	}
	return s.GetRecipe(ctx, recipeID)
}

func replaceIngredients(ctx context.Context, e execer, recipeID uint64, ings []IngredientInput) error {
	if _, err := e.ExecContext(ctx, `DELETE FROM recipe_ingredient WHERE recipe_id = ?`, recipeID); err != nil {
		return err
	}
	for _, in := range ings {
		q := in.Quantity
		if q <= 0 {
			q = 1
		}
		if _, err := e.ExecContext(ctx, `
			INSERT INTO recipe_ingredient (recipe_id, item_id, quantity) VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
			recipeID, in.ItemID, q); err != nil {
			return err
		}
	}
	return nil
}

func replaceLocations(ctx context.Context, e execer, atlasID, recipeID uint64, locationIDs []uint64, locationNames []string) error {
	nameIDs, err := resolveLocationNames(ctx, e, atlasID, locationNames)
	if err != nil {
		return err
	}
	all := append([]uint64{}, locationIDs...)
	all = append(all, nameIDs...)

	if _, err := e.ExecContext(ctx, `DELETE FROM recipe_location WHERE recipe_id = ?`, recipeID); err != nil {
		return err
	}
	seen := map[uint64]bool{}
	for _, lid := range all {
		if seen[lid] {
			continue
		}
		seen[lid] = true
		if _, err := e.ExecContext(ctx,
			`INSERT IGNORE INTO recipe_location (recipe_id, location_id) VALUES (?, ?)`, recipeID, lid); err != nil {
			return err
		}
	}
	return nil
}
