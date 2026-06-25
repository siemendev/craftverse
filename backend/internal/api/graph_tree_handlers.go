package api

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/siemendev/craftverse/backend/internal/tree"
)

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	gd, err := s.store.GraphForAtlas(r.Context(), atlasID)
	if err != nil {
		writeDBError(w, err)
		return
	}

	// Per-item union of location ids across its recipes.
	itemLocations := map[uint64]map[uint64]bool{}
	for _, rec := range gd.Recipes {
		for _, lid := range gd.RecipeLocations[rec.ID] {
			if itemLocations[rec.OutputItemID] == nil {
				itemLocations[rec.OutputItemID] = map[uint64]bool{}
			}
			itemLocations[rec.OutputItemID][lid] = true
		}
	}

	out := graphDTO{
		Atlas:     toAtlasDTO(gd.Atlas),
		Items:     make([]itemSummaryDTO, 0, len(gd.Items)),
		Locations: toLocationDTOs(gd.Locations),
		Edges:     make([]edgeDTO, 0, len(gd.Edges)),
		Recipes:   make([]recipeSummaryDTO, 0, len(gd.Recipes)),
	}

	for _, it := range gd.Items {
		out.Items = append(out.Items, itemSummaryDTO{
			ID:          idStr(it.ID),
			Name:        it.Name,
			Tags:        toTagDTOs(gd.ItemTags[it.ID]),
			IsRaw:       !gd.ItemHasRecipe[it.ID],
			LocationIDs: sortedIDStrings(itemLocations[it.ID]),
		})
	}

	for _, e := range gd.Edges {
		out.Edges = append(out.Edges, edgeDTO{
			ID:         "ri:" + idStr(e.IngredientID),
			RecipeID:   idStr(e.RecipeID),
			FromItemID: idStr(e.FromItemID),
			ToItemID:   idStr(e.ToItemID),
			Quantity:   e.Quantity,
		})
	}

	for _, rec := range gd.Recipes {
		locIDs := make([]string, 0, len(gd.RecipeLocations[rec.ID]))
		for _, lid := range gd.RecipeLocations[rec.ID] {
			locIDs = append(locIDs, idStr(lid))
		}
		sort.Strings(locIDs)
		out.Recipes = append(out.Recipes, recipeSummaryDTO{
			ID:           idStr(rec.ID),
			OutputItemID: idStr(rec.OutputItemID),
			IsPrimary:    rec.IsPrimary,
			LocationIDs:  locIDs,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func sortedIDStrings(set map[uint64]bool) []string {
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, idStr(id))
	}
	sort.Strings(out)
	return out
}

func (s *Server) handleItemTree(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	// Verify the item exists for a clean 404.
	if _, err := s.store.GetItem(r.Context(), id); err != nil {
		writeDBError(w, err)
		return
	}
	maxDepth := tree.DefaultMaxDepth
	if raw := r.URL.Query().Get("maxDepth"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			maxDepth = n
		}
	}
	resolver := tree.NewResolver(s.store.TreeProvider(), maxDepth)
	node, err := resolver.Resolve(r.Context(), id)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTreeNodeDTO(node))
}
