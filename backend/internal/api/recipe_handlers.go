package api

import (
	"errors"
	"net/http"

	"github.com/siemendev/craftverse/backend/internal/db"
)

type ingredientInputJSON struct {
	ItemID   string `json:"itemId"`
	Quantity int    `json:"quantity"`
}

func toIngredientInputs(in []ingredientInputJSON) []db.IngredientInput {
	out := make([]db.IngredientInput, 0, len(in))
	for _, i := range in {
		ids := parseIDList([]string{i.ItemID})
		if len(ids) == 0 {
			continue
		}
		out = append(out, db.IngredientInput{ItemID: ids[0], Quantity: i.Quantity})
	}
	return out
}

func (s *Server) handleCreateRecipe(w http.ResponseWriter, r *http.Request) {
	outputItemID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		IsPrimary     bool                  `json:"isPrimary"`
		Ingredients   []ingredientInputJSON `json:"ingredients"`
		LocationIDs   []string              `json:"locationIds"`
		LocationNames []string              `json:"locationNames"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	rec, err := s.store.CreateRecipe(r.Context(), outputItemID, body.IsPrimary,
		toIngredientInputs(body.Ingredients), parseIDList(body.LocationIDs), body.LocationNames)
	if err != nil {
		writeDBError(w, err)
		return
	}
	s.writeRecipe(w, r, rec, http.StatusCreated)
}

func (s *Server) handleUpdateRecipe(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		IsPrimary     *bool                  `json:"isPrimary"`
		Ingredients   *[]ingredientInputJSON `json:"ingredients"`
		LocationIDs   *[]string              `json:"locationIds"`
		LocationNames *[]string              `json:"locationNames"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	var ings *[]db.IngredientInput
	if body.Ingredients != nil {
		conv := toIngredientInputs(*body.Ingredients)
		ings = &conv
	}
	var locIDs *[]uint64
	if body.LocationIDs != nil {
		ids := parseIDList(*body.LocationIDs)
		locIDs = &ids
	}
	rec, err := s.store.UpdateRecipe(r.Context(), id, body.IsPrimary, ings, locIDs, body.LocationNames)
	if err != nil {
		writeDBError(w, err)
		return
	}
	s.writeRecipe(w, r, rec, http.StatusOK)
}

func (s *Server) handleDeleteRecipe(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	if err := s.store.DeleteRecipe(r.Context(), id); err != nil {
		writeDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAddIngredientEdge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OutputItemID     string `json:"outputItemId"`
		IngredientItemID string `json:"ingredientItemId"`
		Quantity         int    `json:"quantity"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	outIDs := parseIDList([]string{body.OutputItemID})
	ingIDs := parseIDList([]string{body.IngredientItemID})
	if len(outIDs) == 0 || len(ingIDs) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "outputItemId and ingredientItemId are required", nil)
		return
	}
	rec, err := s.store.AddIngredientEdge(r.Context(), outIDs[0], ingIDs[0], body.Quantity)
	if err != nil {
		var amb *db.AmbiguousRecipeError
		if errors.As(err, &amb) {
			ids := make([]string, len(amb.RecipeIDs))
			for i, id := range amb.RecipeIDs {
				ids[i] = idStr(id)
			}
			writeError(w, http.StatusConflict, "ambiguous_recipe",
				"output item has multiple recipes; choose one", map[string]any{"recipeIds": ids})
			return
		}
		writeDBError(w, err)
		return
	}
	s.writeRecipe(w, r, rec, http.StatusCreated)
}

// writeRecipe assembles the full Recipe DTO (ingredients + locations) and writes it.
func (s *Server) writeRecipe(w http.ResponseWriter, r *http.Request, rec db.Recipe, status int) {
	ings, err := s.store.IngredientsForRecipe(r.Context(), rec.ID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	locs, err := s.store.LocationsForRecipe(r.Context(), rec.ID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, status, toRecipeDTO(rec, ings, locs))
}
