package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/auth"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/qso"
)

const maxBodyBytes = 64 << 10

type QsoHandler struct {
	Service *qso.Service
	Valkey  *cache.Valkey
}

func (h QsoHandler) List(w http.ResponseWriter, r *http.Request) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "qso:read") {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	params, err := qso.ParseListQuery(r.URL.Query())
	if err != nil {
		var validation qso.ValidationError
		if errors.As(err, &validation) {
			WriteValidationError(w, validation.Message)
			return
		}
		WriteValidationError(w, "Invalid list parameters")
		return
	}
	result, err := h.Service.List(r.Context(), principal.UserID, params)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

func (h QsoHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "qso:write") {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	input, err := decodeQsoInput(w, r)
	if err != nil {
		return
	}
	item, err := h.Service.Create(r.Context(), principal.UserID, input)
	if errors.Is(err, qso.ErrNoCallsign) {
		WriteValidationError(w, "Set your callsign in Account before logging QSOs")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	h.invalidate(r, principal.UserID)
	WriteJSON(w, http.StatusCreated, map[string]any{"ok": true, "qso": item})
}

func (h QsoHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "qso:read") {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	id := chi.URLParam(r, "id")
	item, err := h.Service.Get(r.Context(), principal.UserID, id)
	if errors.Is(err, qso.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "Not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "qso": item})
}

func (h QsoHandler) Update(w http.ResponseWriter, r *http.Request) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "qso:write") {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	id := chi.URLParam(r, "id")
	input, err := decodeQsoInput(w, r)
	if err != nil {
		return
	}
	item, err := h.Service.Update(r.Context(), principal.UserID, id, input)
	if errors.Is(err, qso.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "Not found")
		return
	}
	if err != nil {
		var validation qso.ValidationError
		if errors.As(err, &validation) {
			WriteValidationError(w, validation.Message)
			return
		}
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	h.invalidate(r, principal.UserID)
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "qso": item})
}

func (h QsoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	principal := auth.PrincipalFromContext(r.Context())
	if !auth.HasScope(principal, "qso:write") {
		WriteError(w, http.StatusForbidden, "Forbidden")
		return
	}
	id := chi.URLParam(r, "id")
	err := h.Service.Delete(r.Context(), principal.UserID, id)
	if errors.Is(err, qso.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "Not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Something went wrong")
		return
	}
	h.invalidate(r, principal.UserID)
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h QsoHandler) invalidate(r *http.Request, userID string) {
	callsign, err := h.Service.RequireUserCallsign(r.Context(), userID)
	if err != nil {
		cache.InvalidateQsoAndHamCache(r.Context(), h.Valkey, userID, nil)
		return
	}
	cache.InvalidateQsoAndHamCache(r.Context(), h.Valkey, userID, []string{callsign})
}

func decodeQsoInput(w http.ResponseWriter, r *http.Request) (qso.Input, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
		WriteError(w, http.StatusUnsupportedMediaType, "Unsupported media type")
		return qso.Input{}, errors.New("bad content type")
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		WriteError(w, http.StatusRequestEntityTooLarge, "Request body too large")
		return qso.Input{}, err
	}
	var raw qso.Input
	if err := json.Unmarshal(body, &raw); err != nil {
		WriteValidationError(w, "Invalid QSO data")
		return qso.Input{}, err
	}
	validated, err := qso.ValidateInput(raw)
	if err != nil {
		var validation qso.ValidationError
		if errors.As(err, &validation) {
			WriteValidationError(w, validation.Message)
		} else {
			WriteValidationError(w, "Invalid QSO data")
		}
		return qso.Input{}, err
	}
	return validated, nil
}
