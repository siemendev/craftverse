// Package tree resolves the recursive crafting tree for an item. Cycles are
// allowed: a node already on the current path is marked cyclic with no
// children, guaranteeing termination. A maxDepth safety cap also applies.
package tree

import "context"

// DefaultMaxDepth is the safety cap used when the caller passes <= 0.
const DefaultMaxDepth = 25

// LocationRef is a location attached to a recipe branch.
type LocationRef struct {
	ID   uint64
	Name string
}

// RecipeData describes one recipe of an item for tree expansion.
type RecipeData struct {
	RecipeID    uint64
	IsPrimary   bool
	Locations   []LocationRef
	Ingredients []IngredientRef // ordered ingredients
}

// IngredientRef is one input of a recipe.
type IngredientRef struct {
	ItemID   uint64
	ItemName string
	Quantity int
}

// Provider supplies the per-item data the resolver needs. Implemented by the
// DB store in production and by fakes in tests.
type Provider interface {
	// ItemName returns the display name of an item.
	ItemName(ctx context.Context, itemID uint64) (string, error)
	// Recipes returns the recipes that produce the given item (empty => raw).
	Recipes(ctx context.Context, itemID uint64) ([]RecipeData, error)
}

// Node is a node in the resolved crafting tree.
type Node struct {
	ItemID   uint64
	ItemName string
	Quantity int
	IsRaw    bool
	Recipes  []RecipeBranch
	Cyclic   bool
}

// RecipeBranch is one OR-branch under a node.
type RecipeBranch struct {
	RecipeID    uint64
	IsPrimary   bool
	Locations   []LocationRef
	Ingredients []Node
}

// Resolver walks the crafting graph.
type Resolver struct {
	p        Provider
	maxDepth int
}

// NewResolver builds a resolver. maxDepth <= 0 uses DefaultMaxDepth.
func NewResolver(p Provider, maxDepth int) *Resolver {
	if maxDepth <= 0 {
		maxDepth = DefaultMaxDepth
	}
	return &Resolver{p: p, maxDepth: maxDepth}
}

// Resolve builds the tree rooted at itemID. The root quantity is 1.
func (r *Resolver) Resolve(ctx context.Context, itemID uint64) (Node, error) {
	name, err := r.p.ItemName(ctx, itemID)
	if err != nil {
		return Node{}, err
	}
	return r.expand(ctx, itemID, name, 1, map[uint64]bool{}, 0)
}

// expand recursively builds a node. visited holds item ids on the CURRENT path.
func (r *Resolver) expand(ctx context.Context, itemID uint64, name string, quantity int, visited map[uint64]bool, depth int) (Node, error) {
	n := Node{ItemID: itemID, ItemName: name, Quantity: quantity, Recipes: []RecipeBranch{}}

	// Cycle on the current path: stop, no children.
	if visited[itemID] {
		n.Cyclic = true
		return n, nil
	}
	// Safety cap: stop expanding further but do not mark cyclic.
	if depth >= r.maxDepth {
		recipes, err := r.p.Recipes(ctx, itemID)
		if err != nil {
			return Node{}, err
		}
		n.IsRaw = len(recipes) == 0
		return n, nil
	}

	recipes, err := r.p.Recipes(ctx, itemID)
	if err != nil {
		return Node{}, err
	}
	if len(recipes) == 0 {
		n.IsRaw = true
		return n, nil
	}

	visited[itemID] = true
	defer delete(visited, itemID) // backtrack so siblings can revisit

	for _, rec := range recipes {
		branch := RecipeBranch{
			RecipeID:    rec.RecipeID,
			IsPrimary:   rec.IsPrimary,
			Locations:   rec.Locations,
			Ingredients: []Node{},
		}
		for _, ing := range rec.Ingredients {
			child, err := r.expand(ctx, ing.ItemID, ing.ItemName, ing.Quantity, visited, depth+1)
			if err != nil {
				return Node{}, err
			}
			branch.Ingredients = append(branch.Ingredients, child)
		}
		n.Recipes = append(n.Recipes, branch)
	}
	return n, nil
}
