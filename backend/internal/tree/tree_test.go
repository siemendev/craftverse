package tree

import (
	"context"
	"testing"
)

// fakeProvider is an in-memory Provider for testing the resolver without a DB.
type fakeProvider struct {
	names   map[uint64]string
	recipes map[uint64][]RecipeData
}

func (f *fakeProvider) ItemName(_ context.Context, id uint64) (string, error) {
	return f.names[id], nil
}

func (f *fakeProvider) Recipes(_ context.Context, id uint64) ([]RecipeData, error) {
	return f.recipes[id], nil
}

// TestCycleStops verifies that a direct cycle A -> B -> A marks the revisited
// node cyclic and omits its children, guaranteeing termination.
func TestCycleStops(t *testing.T) {
	p := &fakeProvider{
		names: map[uint64]string{1: "A", 2: "B"},
		recipes: map[uint64][]RecipeData{
			1: {{RecipeID: 10, Ingredients: []IngredientRef{{ItemID: 2, ItemName: "B", Quantity: 1}}}},
			2: {{RecipeID: 20, Ingredients: []IngredientRef{{ItemID: 1, ItemName: "A", Quantity: 1}}}},
		},
	}
	root, err := NewResolver(p, 0).Resolve(context.Background(), 1)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if root.Cyclic {
		t.Fatal("root should not be cyclic")
	}
	if len(root.Recipes) != 1 {
		t.Fatalf("want 1 recipe branch, got %d", len(root.Recipes))
	}
	b := root.Recipes[0].Ingredients[0] // B
	if b.ItemID != 2 || b.Cyclic {
		t.Fatalf("B should not yet be cyclic: %+v", b)
	}
	a := b.Recipes[0].Ingredients[0] // A again -> cyclic
	if a.ItemID != 1 || !a.Cyclic {
		t.Fatalf("revisited A should be cyclic: %+v", a)
	}
	if len(a.Recipes) != 0 {
		t.Fatalf("cyclic node must have no recipe branches, got %d", len(a.Recipes))
	}
}

// TestSelfCycle verifies A -> A is handled.
func TestSelfCycle(t *testing.T) {
	p := &fakeProvider{
		names: map[uint64]string{1: "A"},
		recipes: map[uint64][]RecipeData{
			1: {{RecipeID: 10, Ingredients: []IngredientRef{{ItemID: 1, ItemName: "A", Quantity: 2}}}},
		},
	}
	root, err := NewResolver(p, 0).Resolve(context.Background(), 1)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	child := root.Recipes[0].Ingredients[0]
	if !child.Cyclic {
		t.Fatalf("self-reference child should be cyclic: %+v", child)
	}
}

// TestRawLeaf verifies an item with no recipes is marked raw.
func TestRawLeaf(t *testing.T) {
	p := &fakeProvider{
		names:   map[uint64]string{1: "Iron"},
		recipes: map[uint64][]RecipeData{},
	}
	root, err := NewResolver(p, 0).Resolve(context.Background(), 1)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if !root.IsRaw {
		t.Fatal("item without recipes should be raw")
	}
	if len(root.Recipes) != 0 {
		t.Fatal("raw item should have no recipe branches")
	}
}

// TestMaxDepth verifies the safety cap stops expansion.
func TestMaxDepth(t *testing.T) {
	// A long chain 1 -> 2 -> 3 -> 4 (each one recipe with one ingredient).
	p := &fakeProvider{
		names: map[uint64]string{1: "1", 2: "2", 3: "3", 4: "4"},
		recipes: map[uint64][]RecipeData{
			1: {{RecipeID: 10, Ingredients: []IngredientRef{{ItemID: 2, ItemName: "2", Quantity: 1}}}},
			2: {{RecipeID: 20, Ingredients: []IngredientRef{{ItemID: 3, ItemName: "3", Quantity: 1}}}},
			3: {{RecipeID: 30, Ingredients: []IngredientRef{{ItemID: 4, ItemName: "4", Quantity: 1}}}},
			4: {{RecipeID: 40, Ingredients: []IngredientRef{{ItemID: 3, ItemName: "3", Quantity: 1}}}},
		},
	}
	// maxDepth=1: root expands once (to item 2), then item 2 is at depth 1 = cap.
	root, err := NewResolver(p, 1).Resolve(context.Background(), 1)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(root.Recipes) != 1 {
		t.Fatalf("root should have expanded once")
	}
	capped := root.Recipes[0].Ingredients[0] // item 2 at depth 1
	if len(capped.Recipes) != 0 {
		t.Fatalf("node at maxDepth must not expand further, got %d branches", len(capped.Recipes))
	}
	if capped.Cyclic {
		t.Fatal("depth-capped node should not be marked cyclic")
	}
}

// TestMultipleRecipesOrBranches verifies OR-branches for multiple recipes.
func TestMultipleRecipesOrBranches(t *testing.T) {
	p := &fakeProvider{
		names: map[uint64]string{1: "Tool", 2: "Wood", 3: "Stone"},
		recipes: map[uint64][]RecipeData{
			1: {
				{RecipeID: 10, IsPrimary: true, Ingredients: []IngredientRef{{ItemID: 2, ItemName: "Wood", Quantity: 1}}},
				{RecipeID: 11, Ingredients: []IngredientRef{{ItemID: 3, ItemName: "Stone", Quantity: 1}}},
			},
		},
	}
	root, err := NewResolver(p, 0).Resolve(context.Background(), 1)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(root.Recipes) != 2 {
		t.Fatalf("want 2 OR-branches, got %d", len(root.Recipes))
	}
}
