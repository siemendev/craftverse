package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/siemendev/craftverse/backend/internal/db"
)

type errorBody struct {
	Error errorPayload `json:"error"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string, details any) {
	writeJSON(w, status, errorBody{Error: errorPayload{Code: code, Message: message, Details: details}})
}

// writeDBError maps common store errors to HTTP responses.
func writeDBError(w http.ResponseWriter, err error) {
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "resource not found", nil)
		return
	}
	writeError(w, http.StatusInternalServerError, "internal", err.Error(), nil)
}

// urlID parses a uint64 id from a URL path parameter.
func urlID(r *http.Request, key string) (uint64, bool) {
	raw := chi.URLParam(r, key)
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}

// decodeJSON decodes the request body, returning false (and writing a 400) on
// failure.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid JSON body: "+err.Error(), nil)
		return false
	}
	return true
}

// parseIDList converts a slice of string ids to uint64s, skipping empties.
func parseIDList(ss []string) []uint64 {
	out := make([]uint64, 0, len(ss))
	for _, s := range ss {
		if s == "" {
			continue
		}
		if id, err := strconv.ParseUint(s, 10, 64); err == nil {
			out = append(out, id)
		}
	}
	return out
}
