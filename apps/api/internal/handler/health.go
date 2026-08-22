package handler

import (
	"context"
	"net/http"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

type HealthHandler struct {
	Mongo *appmongo.Client
}

func (h HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := h.Mongo.Ping(r.Context()); err != nil {
		WriteError(w, http.StatusServiceUnavailable, "Unavailable")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func NewHealthHandler(mongo *appmongo.Client) http.Handler {
	return HealthHandler{Mongo: mongo}
}

func PingMongo(ctx context.Context, mongo *appmongo.Client) error {
	return mongo.Ping(ctx)
}
