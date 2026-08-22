package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

const TokenPrefixLength = 12

var ErrUnauthorized = errors.New("unauthorized")

type Principal struct {
	UserID  string
	TokenID string
	Scopes  map[string]struct{}
}

func HasScope(p Principal, scope string) bool {
	_, ok := p.Scopes[scope]
	return ok
}

func HashToken(token, pepper string) string {
	mac := hmac.New(sha256.New, []byte(pepper))
	_, _ = mac.Write([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(mac.Sum(nil))
}

func constantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

func AuthenticateBearer(
	ctx context.Context,
	store *appmongo.Store,
	rawHeader string,
	pepper string,
) (Principal, error) {
	if pepper == "" {
		return Principal{}, ErrUnauthorized
	}
	token := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rawHeader), "Bearer"))
	if token == "" || len(token) < TokenPrefixLength {
		return Principal{}, ErrUnauthorized
	}
	prefix := token[:TokenPrefixLength]

	doc, err := store.FindActiveTokenByPrefix(ctx, prefix)
	if err != nil || doc == nil {
		return Principal{}, ErrUnauthorized
	}
	expected := HashToken(token, pepper)
	if !constantTimeEqual(expected, doc.TokenHash) {
		return Principal{}, ErrUnauthorized
	}
	if doc.RevokedAt != nil && !doc.RevokedAt.IsZero() {
		return Principal{}, ErrUnauthorized
	}
	if doc.ExpiresAt != nil && doc.ExpiresAt.Before(time.Now().UTC()) {
		return Principal{}, ErrUnauthorized
	}

	scopes := make(map[string]struct{}, len(doc.Scopes))
	for _, scope := range doc.Scopes {
		scopes[scope] = struct{}{}
	}

	go store.TouchTokenLastUsed(context.Background(), doc.ID)

	return Principal{
		UserID:  doc.UserID.Hex(),
		TokenID: doc.ID.Hex(),
		Scopes:  scopes,
	}, nil
}
