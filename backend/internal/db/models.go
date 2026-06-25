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
	ID          uint64
	AtlasID     uint64
	Name        string
	Description *string
	Address     *string
}

// Currency is an atlas-scoped unit of account (e.g. "Gold", "Pay2Win Coins").
// Exactly one currency per atlas is the default.
type Currency struct {
	ID        uint64
	AtlasID   uint64
	Name      string
	IsDefault bool
}

// Price is one buy/sell price of an item at a location in a currency.
type Price struct {
	ID           uint64
	ItemID       uint64
	LocationID   uint64
	LocationName string
	CurrencyID   uint64
	CurrencyName string
	Kind         string // "buy" or "sell"
	Amount       uint64
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
