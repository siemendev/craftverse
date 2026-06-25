package db

import "time"

// Atlas is a game database.
type Atlas struct {
	ID          uint64
	Name        string
	Description *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Tag is an atlas-scoped label.
type Tag struct {
	ID      uint64
	AtlasID uint64
	Name    string
	Color   *string
}

// Location is an atlas-scoped crafting station.
type Location struct {
	ID      uint64
	AtlasID uint64
	Name    string
}

// Item is a craftable or raw material.
type Item struct {
	ID        uint64
	AtlasID   uint64
	Name      string
	Notes     *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Recipe produces exactly one output item.
type Recipe struct {
	ID           uint64
	AtlasID      uint64
	OutputItemID uint64
	IsPrimary    bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Ingredient is one input of a recipe.
type Ingredient struct {
	ID       uint64
	RecipeID uint64
	ItemID   uint64
	ItemName string
	Quantity int
}

// Usage describes where an item is used as an ingredient.
type Usage struct {
	RecipeID       uint64
	OutputItemID   uint64
	OutputItemName string
}

// GraphEdge is one recipe_ingredient projected as a canvas edge.
type GraphEdge struct {
	IngredientID uint64
	RecipeID     uint64
	FromItemID   uint64 // ingredient item
	ToItemID     uint64 // recipe output item
	Quantity     int
}
