package api

import (
	"net/http"

	"github.com/siemendev/craftverse/backend/internal/db"
)

func (s *Server) handleListItems(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	items, err := s.store.ListItems(r.Context(), atlasID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	out := make([]itemDTO, 0, len(items))
	for _, it := range items {
		tags, err := s.store.TagsForItem(r.Context(), it.ID)
		if err != nil {
			writeDBError(w, err)
			return
		}
		out = append(out, toItemDTO(it, tags))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateItem(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name     string   `json:"name"`
		Notes    *string  `json:"notes"`
		TagIDs   []string `json:"tagIds"`
		TagNames []string `json:"tagNames"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	it, err := s.store.CreateItem(r.Context(), atlasID, body.Name, body.Notes, parseIDList(body.TagIDs), body.TagNames)
	if err != nil {
		writeDBError(w, err)
		return
	}
	tags, err := s.store.TagsForItem(r.Context(), it.ID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toItemDTO(it, tags))
}

func (s *Server) handleGetItem(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	detail, err := s.buildItemDetail(r, id)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) buildItemDetail(r *http.Request, id uint64) (itemDetailDTO, error) {
	ctx := r.Context()
	it, err := s.store.GetItem(ctx, id)
	if err != nil {
		return itemDetailDTO{}, err
	}
	tags, err := s.store.TagsForItem(ctx, id)
	if err != nil {
		return itemDetailDTO{}, err
	}
	recipes, err := s.store.RecipesForItem(ctx, id)
	if err != nil {
		return itemDetailDTO{}, err
	}
	detail := itemDetailDTO{itemDTO: toItemDTO(it, tags), Recipes: make([]recipeDTO, 0, len(recipes))}
	for _, rec := range recipes {
		ings, err := s.store.IngredientsForRecipe(ctx, rec.ID)
		if err != nil {
			return itemDetailDTO{}, err
		}
		locs, err := s.store.LocationsForRecipe(ctx, rec.ID)
		if err != nil {
			return itemDetailDTO{}, err
		}
		detail.Recipes = append(detail.Recipes, toRecipeDTO(rec, ings, locs))
	}
	return detail, nil
}

func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name     *string   `json:"name"`
		Notes    *string   `json:"notes"`
		TagIDs   *[]string `json:"tagIds"`
		TagNames *[]string `json:"tagNames"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	var tagIDs *[]uint64
	if body.TagIDs != nil {
		ids := parseIDList(*body.TagIDs)
		tagIDs = &ids
	}
	it, err := s.store.UpdateItem(r.Context(), id, body.Name, body.Notes, tagIDs, body.TagNames)
	if err != nil {
		writeDBError(w, err)
		return
	}
	tags, err := s.store.TagsForItem(r.Context(), it.ID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toItemDTO(it, tags))
}

func (s *Server) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	force := r.URL.Query().Get("force") == "true"
	usages, err := s.store.DeleteItem(r.Context(), id, force)
	if err != nil {
		writeDBError(w, err)
		return
	}
	if len(usages) > 0 {
		// Blocked: item is used as an ingredient elsewhere.
		writeError(w, http.StatusConflict, "item_in_use", "item is used as an ingredient", map[string]any{
			"usedIn": toUsageList(usages),
		})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func toUsageList(usages []db.Usage) []map[string]string {
	out := make([]map[string]string, 0, len(usages))
	for _, u := range usages {
		out = append(out, map[string]string{
			"recipeId":       idStr(u.RecipeID),
			"outputItemId":   idStr(u.OutputItemID),
			"outputItemName": u.OutputItemName,
		})
	}
	return out
}
