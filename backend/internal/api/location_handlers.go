package api

import (
	"net/http"
	"strings"
)

func (s *Server) handleGetLocation(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	l, err := s.store.GetLocation(r.Context(), id)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toLocationDTO(l))
}

func (s *Server) handleUpdateLocation(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
		Address     *string `json:"address"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	l, err := s.store.UpdateLocation(r.Context(), id,
		strings.TrimSpace(body.Name), normalizeOptional(body.Description), normalizeOptional(body.Address))
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toLocationDTO(l))
}

func (s *Server) handleDeleteLocation(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	usage, err := s.store.DeleteLocation(r.Context(), id)
	if err != nil {
		writeDBError(w, err)
		return
	}
	if usage.RecipeCount > 0 || usage.PriceCount > 0 {
		writeError(w, http.StatusConflict, "location_in_use", "location is used by recipes or prices", map[string]any{
			"recipeCount": usage.RecipeCount,
			"priceCount":  usage.PriceCount,
		})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// normalizeOptional trims an optional string and collapses an empty result to
// nil so blank form fields clear the column instead of storing "".
func normalizeOptional(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}
