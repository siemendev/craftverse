// Package api wires the HTTP routes and handlers for the Craftverse backend.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/siemendev/craftverse/backend/internal/auth"
	"github.com/siemendev/craftverse/backend/internal/db"
)

// Server holds dependencies shared by all handlers.
type Server struct {
	store *db.Store
	auth  *auth.Authenticator
}

// New builds a Server.
func New(store *db.Store, authn *auth.Authenticator) *Server {
	return &Server{store: store, auth: authn}
}

// Router builds the chi router with middleware and all routes mounted under /api.
func (s *Server) Router(corsOrigins []string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	allowed := corsOrigins
	if len(allowed) == 0 {
		allowed = []string{"*"}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowed,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		// Health check: no auth.
		r.Get("/healthz", s.handleHealthz)

		// Public read routes: atlases are public, so viewing needs no login.
		// Auth is optional — a valid token is honored if present, but absent or
		// invalid tokens still get through (read-only).
		r.Group(func(r chi.Router) {
			r.Use(s.auth.Optional)

			// Atlases
			r.Get("/atlases", s.handleListAtlases)
			r.Get("/atlases/{id}", s.handleGetAtlas)

			// Graph
			r.Get("/atlases/{id}/graph", s.handleGraph)

			// Atlas-scoped collections
			r.Get("/atlases/{id}/items", s.handleListItems)
			r.Get("/atlases/{id}/locations", s.handleListLocations)
			r.Get("/atlases/{id}/tags", s.handleListTags)
			r.Get("/atlases/{id}/currencies", s.handleListCurrencies)

			// Items
			r.Get("/items/{id}", s.handleGetItem)
			r.Get("/items/{id}/tree", s.handleItemTree)

			// Locations
			r.Get("/locations/{id}", s.handleGetLocation)
		})

		// Write routes require a valid login (no-op gate in dev mode).
		r.Group(func(r chi.Router) {
			r.Use(s.auth.Middleware)

			// Atlases
			r.Post("/atlases", s.handleCreateAtlas)
			r.Patch("/atlases/{id}", s.handleUpdateAtlas)
			r.Delete("/atlases/{id}", s.handleDeleteAtlas)

			// Atlas-scoped collections
			r.Post("/atlases/{id}/items", s.handleCreateItem)
			r.Post("/atlases/{id}/locations", s.handleCreateLocation)
			r.Post("/atlases/{id}/tags", s.handleCreateTag)
			r.Post("/atlases/{id}/currencies", s.handleCreateCurrency)

			// Currencies
			r.Patch("/currencies/{id}", s.handleUpdateCurrency)
			r.Delete("/currencies/{id}", s.handleDeleteCurrency)

			// Locations
			r.Patch("/locations/{id}", s.handleUpdateLocation)
			r.Delete("/locations/{id}", s.handleDeleteLocation)

			// Items
			r.Patch("/items/{id}", s.handleUpdateItem)
			r.Patch("/items/{id}/prices", s.handleUpdateItemPrices)
			r.Delete("/items/{id}", s.handleDeleteItem)
			r.Post("/items/{id}/recipes", s.handleCreateRecipe)

			// Recipes
			r.Post("/recipes/ingredient", s.handleAddIngredientEdge)
			r.Patch("/recipes/{id}", s.handleUpdateRecipe)
			r.Delete("/recipes/{id}", s.handleDeleteRecipe)
		})
	})

	return r
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
