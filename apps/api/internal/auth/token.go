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

	if valkey != nil && valkey.Available() {
		if entry, err := cache.GetAuthCacheByPrefix(ctx, valkey, prefix); err == nil && entry != nil {
			if principal, ok := principalFromCacheEntry(entry, expected); ok {
				if oid, err := primitive.ObjectIDFromHex(entry.TokenID); err == nil {
					go store.TouchTokenLastUsed(context.Background(), oid)
				}
				return principal, nil
			}
		}
	}

	doc, err := store.FindActiveTokenByPrefix(ctx, prefix)
	if err != nil || doc == nil {
		return Principal{}, ErrUnauthorized
	}
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

	if valkey != nil && valkey.Available() && authCacheTTL > 0 {
		cache.SetAuthCache(ctx, valkey, cacheEntryFromDoc(doc, prefix), authCacheTTL)
	}

	go store.TouchTokenLastUsed(context.Background(), doc.ID)

	return Principal{
		UserID:  doc.UserID.Hex(),
		TokenID: doc.ID.Hex(),
		Scopes:  scopes,
	}, nil
}

func principalFromCacheEntry(entry *cache.AuthCacheEntry, expectedHash string) (Principal, bool) {
	if entry == nil || entry.RevokedAt != nil {
		return Principal{}, false
	}
	if !constantTimeEqual(expectedHash, entry.TokenHash) {
		return Principal{}, false
	}
	if entry.ExpiresAt != nil {
		parsed, err := time.Parse(time.RFC3339, *entry.ExpiresAt)
		if err == nil && parsed.Before(time.Now().UTC()) {
			return Principal{}, false
		}
	}
	scopes := make(map[string]struct{}, len(entry.Scopes))
	for _, scope := range entry.Scopes {
		scopes[scope] = struct{}{}
	}
	return Principal{
		UserID:  entry.UserID,
		TokenID: entry.TokenID,
		Scopes:  scopes,
	}, true
}

func cacheEntryFromDoc(doc *appmongo.ApiToken, prefix string) cache.AuthCacheEntry {
	entry := cache.AuthCacheEntry{
		TokenID:     doc.ID.Hex(),
		TokenPrefix: prefix,
		UserID:      doc.UserID.Hex(),
		TokenHash:   doc.TokenHash,
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
