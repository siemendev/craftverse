package api

import "net/http"

func (s *Server) handleListCurrencies(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	cs, err := s.store.ListCurrencies(r.Context(), atlasID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toCurrencyDTOs(cs))
}

func (s *Server) handleCreateCurrency(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name      string `json:"name"`
		IsDefault bool   `json:"isDefault"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	c, err := s.store.CreateCurrency(r.Context(), atlasID, body.Name, body.IsDefault)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toCurrencyDTO(c))
}

func (s *Server) handleUpdateCurrency(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name      *string `json:"name"`
		IsDefault *bool   `json:"isDefault"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	c, err := s.store.UpdateCurrency(r.Context(), id, body.Name, body.IsDefault)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toCurrencyDTO(c))
}

func (s *Server) handleDeleteCurrency(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	if err := s.store.DeleteCurrency(r.Context(), id); err != nil {
		writeDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
