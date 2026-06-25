package db

import "context"

// GraphData is the raw data the API assembles into the Graph DTO.
type GraphData struct {
	Atlas     Atlas
	Items     []Item
	ItemTags  map[uint64][]Tag
	Locations []Location
	Edges     []GraphEdge
	Recipes   []Recipe
	// RecipeLocations maps recipeID -> location ids.
	RecipeLocations map[uint64][]uint64
	// ItemHasRecipe marks items that are an output of at least one recipe.
	ItemHasRecipe map[uint64]bool
}

// GraphForAtlas loads everything the canvas needs in a handful of queries.
func (s *Store) GraphForAtlas(ctx context.Context, atlasID uint64) (GraphData, error) {
	var gd GraphData
	atlas, err := s.GetAtlas(ctx, atlasID)
	if err != nil {
		return gd, err
	}
	gd.Atlas = atlas

	if gd.Items, err = s.ListItems(ctx, atlasID); err != nil {
		return gd, err
	}
	if gd.ItemTags, err = s.TagsForItems(ctx, atlasID); err != nil {
		return gd, err
	}
	if gd.Locations, err = s.ListLocations(ctx, atlasID); err != nil {
		return gd, err
	}

	// Recipes of the atlas.
	rrows, err := s.db.QueryContext(ctx,
		`SELECT id, atlas_id, output_item_id, is_primary, created_at, updated_at
		 FROM recipe WHERE atlas_id = ? ORDER BY id`, atlasID)
	if err != nil {
		return gd, err
	}
	gd.ItemHasRecipe = map[uint64]bool{}
	func() {
		defer rrows.Close()
		for rrows.Next() {
			var r Recipe
			if err = rrows.Scan(&r.ID, &r.AtlasID, &r.OutputItemID, &r.IsPrimary, &r.CreatedAt, &r.UpdatedAt); err != nil {
				return
			}
			gd.Recipes = append(gd.Recipes, r)
			gd.ItemHasRecipe[r.OutputItemID] = true
		}
		err = rrows.Err()
	}()
	if err != nil {
		return gd, err
	}

	// Edges: one per recipe_ingredient (ingredient item -> output item).
	erows, err := s.db.QueryContext(ctx, `
		SELECT ri.id, ri.recipe_id, ri.item_id, r.output_item_id, ri.quantity
		FROM recipe_ingredient ri
		JOIN recipe r ON r.id = ri.recipe_id
		WHERE r.atlas_id = ?
		ORDER BY ri.id`, atlasID)
	if err != nil {
		return gd, err
	}
	func() {
		defer erows.Close()
		for erows.Next() {
			var e GraphEdge
			if err = erows.Scan(&e.IngredientID, &e.RecipeID, &e.FromItemID, &e.ToItemID, &e.Quantity); err != nil {
				return
			}
			gd.Edges = append(gd.Edges, e)
		}
		err = erows.Err()
	}()
	if err != nil {
		return gd, err
	}

	// Recipe -> location ids.
	lrows, err := s.db.QueryContext(ctx, `
		SELECT rl.recipe_id, rl.location_id
		FROM recipe_location rl
		JOIN recipe r ON r.id = rl.recipe_id
		WHERE r.atlas_id = ?`, atlasID)
	if err != nil {
		return gd, err
	}
	gd.RecipeLocations = map[uint64][]uint64{}
	func() {
		defer lrows.Close()
		for lrows.Next() {
			var rid, lid uint64
			if err = lrows.Scan(&rid, &lid); err != nil {
				return
			}
			gd.RecipeLocations[rid] = append(gd.RecipeLocations[rid], lid)
		}
		err = lrows.Err()
	}()
	if err != nil {
		return gd, err
	}
	return gd, nil
}
