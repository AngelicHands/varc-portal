package handler

import (
	"net/http"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/respond"
)

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	respond.JSON(w, status, payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	respond.Error(w, status, message)
}

func WriteValidationError(w http.ResponseWriter, message string) {
	respond.ValidationError(w, message)
}
