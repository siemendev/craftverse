package api

import "net/http"

func (s *Server) handleListAtlases(w http.ResponseWriter, r *http.Request) {
	atlases, err := s.store.ListAtlases(r.Context())
	if err != nil {
		writeDBError(w, err)
		return
	}
	out := make([]atlasDTO, 0, len(atlases))
	for _, a := range atlases {
		out = append(out, toAtlasDTO(a))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateAtlas(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	a, err := s.store.CreateAtlas(r.Context(), body.Name, body.Description)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toAtlasDTO(a))
}

func (s *Server) handleGetAtlas(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	a, err := s.store.GetAtlas(r.Context(), id)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toAtlasDTO(a))
}

func (s *Server) handleUpdateAtlas(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	a, err := s.store.UpdateAtlas(r.Context(), id, body.Name, body.Description)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toAtlasDTO(a))
}

func (s *Server) handleDeleteAtlas(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	if err := s.store.DeleteAtlas(r.Context(), id); err != nil {
		writeDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Tags ---

func (s *Server) handleListTags(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	tags, err := s.store.ListTags(r.Context(), atlasID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTagDTOs(tags))
}

func (s *Server) handleCreateTag(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name  string  `json:"name"`
		Color *string `json:"color"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	t, err := s.store.CreateTag(r.Context(), atlasID, body.Name, body.Color)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTagDTO(t))
}

// --- Locations ---

func (s *Server) handleListLocations(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	locs, err := s.store.ListLocations(r.Context(), atlasID)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toLocationDTOs(locs))
}

func (s *Server) handleCreateLocation(w http.ResponseWriter, r *http.Request) {
	atlasID, ok := urlID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id", nil)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required", nil)
		return
	}
	l, err := s.store.CreateLocation(r.Context(), atlasID, body.Name)
	if err != nil {
		writeDBError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toLocationDTO(l))
}
