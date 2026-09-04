package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/auth"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/callsign"
)

type CallsignHandler struct {
	Service *callsign.Service
}

func requireCallsignAccess(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "callsign:read") || !auth.CanManageCallsigns(principal.Role) {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return principal, false
	}
	return principal, true
}

func (h CallsignHandler) Search(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireCallsignAccess(w, r); !ok {
		return
	}
	params, err := callsign.ParseListQuery(r.URL.Query())
	if err != nil {
		var validation callsign.ValidationError
		if errors.As(err, &validation) {
			WriteValidationError(w, validation.Message)
			return
		}
		WriteValidationError(w, "Invalid list parameters")
		return
	}
	result, err := h.Service.Search(r.Context(), params)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

func (h CallsignHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireCallsignAccess(w, r); !ok {
		return
	}
	result, err := h.Service.Stats(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

func (h CallsignHandler) Get(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireCallsignAccess(w, r); !ok {
		return
	}
	sign := chi.URLParam(r, "sign")
	result, err := h.Service.GetBySign(r.Context(), sign)
	if errors.Is(err, callsign.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "Not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	WriteJSON(w, http.StatusOK, result)
}
