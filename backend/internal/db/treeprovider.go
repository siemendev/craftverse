package db

import (
	"context"

	"github.com/siemendev/craftverse/backend/internal/tree"
)

// TreeProvider adapts the Store to the tree.Provider interface.
type TreeProvider struct {
	s *Store
}

// TreeProvider returns a tree.Provider backed by this store.
func (s *Store) TreeProvider() *TreeProvider { return &TreeProvider{s: s} }

// ItemName returns an item's display name.
func (p *TreeProvider) ItemName(ctx context.Context, itemID uint64) (string, error) {
	it, err := p.s.GetItem(ctx, itemID)
	if err != nil {
		return "", err
	}
	return it.Name, nil
}

// Recipes returns the recipes (with ingredients and locations) producing item.
func (p *TreeProvider) Recipes(ctx context.Context, itemID uint64) ([]tree.RecipeData, error) {
	recipes, err := p.s.RecipesForItem(ctx, itemID)
	if err != nil {
		return nil, err
	}
	out := make([]tree.RecipeData, 0, len(recipes))
	for _, r := range recipes {
		ings, err := p.s.IngredientsForRecipe(ctx, r.ID)
		if err != nil {
			return nil, err
		}
		locs, err := p.s.LocationsForRecipe(ctx, r.ID)
		if err != nil {
			return nil, err
		}
		rd := tree.RecipeData{RecipeID: r.ID, IsPrimary: r.IsPrimary}
		for _, l := range locs {
			rd.Locations = append(rd.Locations, tree.LocationRef{ID: l.ID, Name: l.Name})
		}
		for _, in := range ings {
			rd.Ingredients = append(rd.Ingredients, tree.IngredientRef{
				ItemID: in.ItemID, ItemName: in.ItemName, Quantity: in.Quantity,
			})
		}
		out = append(out, rd)
	}
	return out, nil
}
