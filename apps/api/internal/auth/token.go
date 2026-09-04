package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const TokenPrefixLength = 12

var ErrUnauthorized = errors.New("unauthorized")

type Principal struct {
	UserID  string
	TokenID string
	Role    string
	Scopes  map[string]struct{}
}

func HasScope(p Principal, scope string) bool {
	_, ok := p.Scopes[scope]
	return ok
}

// CanManageCallsigns mirrors portal canManageCallsigns: Setup Admin / Administrator only.
func CanManageCallsigns(role string) bool {
	key := strings.ToLower(strings.TrimSpace(role))
	switch key {
	case "system_admin":
		key = "setup_admin"
	case "user":
		key = "reader"
	}
	return key == "setup_admin" || key == "administrator"
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

func scopesFromDoc(scopes []string) map[string]struct{} {
	out := make(map[string]struct{}, len(scopes))
	for _, scope := range scopes {
		out[scope] = struct{}{}
	}
	return out
}

func tokenStillValid(doc *appmongo.ApiToken) bool {
	if doc == nil {
		return false
	}
	if doc.RevokedAt != nil && !doc.RevokedAt.IsZero() {
		return false
	}
	if doc.ExpiresAt != nil && doc.ExpiresAt.Before(time.Now().UTC()) {
		return false
	}
	return true
}

func cacheEntryExpired(entry *cache.AuthCacheEntry) bool {
	if entry == nil || entry.ExpiresAt == nil {
		return false
	}
	parsed, err := time.Parse(time.RFC3339, *entry.ExpiresAt)
	if err != nil {
		return false
	}
	return parsed.Before(time.Now().UTC())
}

func AuthenticateBearer(
	ctx context.Context,
	store *appmongo.Store,
	valkey *cache.Valkey,
	rawHeader string,
	pepper string,
	authCacheTTL time.Duration,
) (Principal, error) {
	if pepper == "" {
		return Principal{}, ErrUnauthorized
	}
	token := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rawHeader), "Bearer"))
	if token == "" || len(token) < TokenPrefixLength {
		return Principal{}, ErrUnauthorized
	}
	prefix := token[:TokenPrefixLength]
	expected := HashToken(token, pepper)

	var doc *appmongo.ApiToken

	// Cache accelerates locating the token id after hash check. Scopes and role are
	// always read from Mongo so permission updates apply on the next request.
	if valkey != nil && valkey.Available() {
		if entry, err := cache.GetAuthCacheByPrefix(ctx, valkey, prefix); err == nil && entry != nil {
			if entry.RevokedAt != nil || cacheEntryExpired(entry) || !constantTimeEqual(expected, entry.TokenHash) {
				cache.DeleteAuthCache(ctx, valkey, entry.TokenID, prefix)
			} else if oid, err := primitive.ObjectIDFromHex(entry.TokenID); err == nil {
				fresh, findErr := store.FindActiveTokenByID(ctx, oid)
				if findErr != nil {
					return Principal{}, ErrUnauthorized
				}
				if tokenStillValid(fresh) && constantTimeEqual(expected, fresh.TokenHash) {
					doc = fresh
				} else {
					cache.DeleteAuthCache(ctx, valkey, entry.TokenID, prefix)
				}
			}
		}
	}

	if doc == nil {
		found, err := store.FindActiveTokenByPrefix(ctx, prefix)
		if err != nil || found == nil {
			return Principal{}, ErrUnauthorized
		}
		if !constantTimeEqual(expected, found.TokenHash) || !tokenStillValid(found) {
			return Principal{}, ErrUnauthorized
		}
		doc = found
	}

	role, err := store.UserRole(ctx, doc.UserID)
	if err != nil {
		return Principal{}, ErrUnauthorized
	}

	if valkey != nil && valkey.Available() && authCacheTTL > 0 {
		cache.SetAuthCache(ctx, valkey, cacheEntryFromDoc(doc, prefix, role), authCacheTTL)
	}

	go store.TouchTokenLastUsed(context.Background(), doc.ID)

	return Principal{
		UserID:  doc.UserID.Hex(),
		TokenID: doc.ID.Hex(),
		Role:    role,
		Scopes:  scopesFromDoc(doc.Scopes),
	}, nil
}

func cacheEntryFromDoc(doc *appmongo.ApiToken, prefix, role string) cache.AuthCacheEntry {
	entry := cache.AuthCacheEntry{
		TokenID:     doc.ID.Hex(),
		TokenPrefix: prefix,
		UserID:      doc.UserID.Hex(),
		TokenHash:   doc.TokenHash,
		Role:        role,
		Scopes:      doc.Scopes,
	}
	if doc.ExpiresAt != nil {
		formatted := doc.ExpiresAt.UTC().Format(time.RFC3339)
		entry.ExpiresAt = &formatted
	}
	if doc.RevokedAt != nil && !doc.RevokedAt.IsZero() {
		formatted := doc.RevokedAt.UTC().Format(time.RFC3339)
		entry.RevokedAt = &formatted
	}
	return entry
}
