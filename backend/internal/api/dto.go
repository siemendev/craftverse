package api

import (
	"strconv"
	"time"

	"github.com/siemendev/craftverse/backend/internal/db"
	"github.com/siemendev/craftverse/backend/internal/tree"
)

// idStr renders a uint64 id as a JSON string per the contract.
func idStr(id uint64) string { return strconv.FormatUint(id, 10) }

func rfc3339(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// --- DTOs (JSON shapes from CONTRACTS.md) ---

type atlasDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type tagDTO struct {
	ID      string  `json:"id"`
	AtlasID string  `json:"atlasId"`
	Name    string  `json:"name"`
	Color   *string `json:"color,omitempty"`
}

type locationDTO struct {
	ID      string `json:"id"`
	AtlasID string `json:"atlasId"`
	Name    string `json:"name"`
}

type itemDTO struct {
	ID        string   `json:"id"`
	AtlasID   string   `json:"atlasId"`
	Name      string   `json:"name"`
	Notes     *string  `json:"notes,omitempty"`
	Tags      []tagDTO `json:"tags"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

type itemSummaryDTO struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Tags        []tagDTO `json:"tags"`
	IsRaw       bool     `json:"isRaw"`
	LocationIDs []string `json:"locationIds"`
}

type ingredientDTO struct {
	ID       string `json:"id"`
	ItemID   string `json:"itemId"`
	ItemName string `json:"itemName"`
	Quantity int    `json:"quantity"`
}

type recipeDTO struct {
	ID           string          `json:"id"`
	OutputItemID string          `json:"outputItemId"`
	IsPrimary    bool            `json:"isPrimary"`
	Ingredients  []ingredientDTO `json:"ingredients"`
	Locations    []locationDTO   `json:"locations"`
}

type recipeSummaryDTO struct {
	ID           string   `json:"id"`
	OutputItemID string   `json:"outputItemId"`
	IsPrimary    bool     `json:"isPrimary"`
	LocationIDs  []string `json:"locationIds"`
}

type itemDetailDTO struct {
	itemDTO
	Recipes []recipeDTO `json:"recipes"`
}

type edgeDTO struct {
	ID         string `json:"id"`
	RecipeID   string `json:"recipeId"`
	FromItemID string `json:"fromItemId"`
	ToItemID   string `json:"toItemId"`
	Quantity   int    `json:"quantity"`
}

type graphDTO struct {
	Atlas     atlasDTO           `json:"atlas"`
	Items     []itemSummaryDTO   `json:"items"`
	Locations []locationDTO      `json:"locations"`
	Edges     []edgeDTO          `json:"edges"`
	Recipes   []recipeSummaryDTO `json:"recipes"`
}

type treeNodeDTO struct {
	ItemID   string          `json:"itemId"`
	ItemName string          `json:"itemName"`
	Quantity int             `json:"quantity"`
	IsRaw    bool            `json:"isRaw"`
	Recipes  []treeRecipeDTO `json:"recipes"`
	Cyclic   bool            `json:"cyclic"`
}

type treeRecipeDTO struct {
	RecipeID    string        `json:"recipeId"`
	IsPrimary   bool          `json:"isPrimary"`
	Locations   []locationDTO `json:"locations"`
	Ingredients []treeNodeDTO `json:"ingredients"`
}

// --- mappers ---

func toAtlasDTO(a db.Atlas) atlasDTO {
	return atlasDTO{
		ID:          idStr(a.ID),
		Name:        a.Name,
		Description: a.Description,
		CreatedAt:   rfc3339(a.CreatedAt),
		UpdatedAt:   rfc3339(a.UpdatedAt),
	}
}

func toTagDTO(t db.Tag) tagDTO {
	return tagDTO{ID: idStr(t.ID), AtlasID: idStr(t.AtlasID), Name: t.Name, Color: t.Color}
}

func toTagDTOs(tags []db.Tag) []tagDTO {
	out := make([]tagDTO, 0, len(tags))
	for _, t := range tags {
		out = append(out, toTagDTO(t))
	}
	return out
}

func toLocationDTO(l db.Location) locationDTO {
	return locationDTO{ID: idStr(l.ID), AtlasID: idStr(l.AtlasID), Name: l.Name}
}

func toLocationDTOs(ls []db.Location) []locationDTO {
	out := make([]locationDTO, 0, len(ls))
	for _, l := range ls {
		out = append(out, toLocationDTO(l))
	}
	return out
}

func toItemDTO(it db.Item, tags []db.Tag) itemDTO {
	return itemDTO{
		ID:        idStr(it.ID),
		AtlasID:   idStr(it.AtlasID),
		Name:      it.Name,
		Notes:     it.Notes,
		Tags:      toTagDTOs(tags),
		CreatedAt: rfc3339(it.CreatedAt),
		UpdatedAt: rfc3339(it.UpdatedAt),
	}
}

func toIngredientDTO(in db.Ingredient) ingredientDTO {
	return ingredientDTO{
		ID:       idStr(in.ID),
		ItemID:   idStr(in.ItemID),
		ItemName: in.ItemName,
		Quantity: in.Quantity,
	}
}

func toRecipeDTO(r db.Recipe, ings []db.Ingredient, locs []db.Location) recipeDTO {
	out := recipeDTO{
		ID:           idStr(r.ID),
		OutputItemID: idStr(r.OutputItemID),
		IsPrimary:    r.IsPrimary,
		Ingredients:  make([]ingredientDTO, 0, len(ings)),
		Locations:    toLocationDTOs(locs),
	}
	for _, in := range ings {
		out.Ingredients = append(out.Ingredients, toIngredientDTO(in))
	}
	return out
}

func toTreeNodeDTO(n tree.Node) treeNodeDTO {
	d := treeNodeDTO{
		ItemID:   idStr(n.ItemID),
		ItemName: n.ItemName,
		Quantity: n.Quantity,
		IsRaw:    n.IsRaw,
		Cyclic:   n.Cyclic,
		Recipes:  make([]treeRecipeDTO, 0, len(n.Recipes)),
	}
	for _, br := range n.Recipes {
		rd := treeRecipeDTO{
			RecipeID:    idStr(br.RecipeID),
			IsPrimary:   br.IsPrimary,
			Locations:   make([]locationDTO, 0, len(br.Locations)),
			Ingredients: make([]treeNodeDTO, 0, len(br.Ingredients)),
		}
		for _, l := range br.Locations {
			rd.Locations = append(rd.Locations, locationDTO{ID: idStr(l.ID), Name: l.Name})
		}
		for _, child := range br.Ingredients {
			rd.Ingredients = append(rd.Ingredients, toTreeNodeDTO(child))
		}
		d.Recipes = append(d.Recipes, rd)
	}
	return d
}
