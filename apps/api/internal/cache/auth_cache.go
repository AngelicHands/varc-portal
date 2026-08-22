package cache

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	authTokenKeyPrefix  = "api:auth:token:"
	authPrefixKeyPrefix = "api:auth:prefix:"
	DefaultAuthCacheTTL = 90 * time.Second
)

type AuthCacheEntry struct {
	TokenID     string   `json:"tokenId"`
	TokenPrefix string   `json:"tokenPrefix"`
	UserID      string   `json:"userId"`
	TokenHash   string   `json:"tokenHash"`
	Scopes      []string `json:"scopes"`
	ExpiresAt   *string  `json:"expiresAt,omitempty"`
	RevokedAt   *string  `json:"revokedAt,omitempty"`
}

func authTokenKey(tokenID string) string {
	return authTokenKeyPrefix + tokenID
}

func authPrefixKey(prefix string) string {
	return authPrefixKeyPrefix + prefix
}

func GetAuthCacheByPrefix(ctx context.Context, v *Valkey, prefix string) (*AuthCacheEntry, error) {
	if v == nil || !v.Available() || prefix == "" {
		return nil, nil
	}
	tokenID, err := v.client.Get(ctx, authPrefixKey(prefix)).Result()
	if err != nil || tokenID == "" {
		return nil, nil
	}
	raw, err := v.client.Get(ctx, authTokenKey(tokenID)).Result()
	if err != nil || raw == "" {
		return nil, nil
	}
	var entry AuthCacheEntry
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		return nil, nil
	}
	return &entry, nil
}

func SetAuthCache(ctx context.Context, v *Valkey, entry AuthCacheEntry, ttl time.Duration) {
	if v == nil || !v.Available() || entry.TokenID == "" || entry.TokenHash == "" {
		return
	}
	payload, err := json.Marshal(entry)
	if err != nil {
		return
	}
	pipe := v.client.Pipeline()
	pipe.Set(ctx, authTokenKey(entry.TokenID), payload, ttl)
	if entry.TokenPrefix != "" {
		pipe.Set(ctx, authPrefixKey(entry.TokenPrefix), entry.TokenID, ttl)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("valkey set auth cache: %v", err)
	}
}

func FlushAuthCache(ctx context.Context, v *Valkey) error {
	if v == nil || !v.Available() {
		return nil
	}
	patterns := []string{authTokenKeyPrefix + "*", authPrefixKeyPrefix + "*"}
	var keys []string
	for _, pattern := range patterns {
		iter := v.client.Scan(ctx, 0, pattern, 100).Iterator()
		for iter.Next(ctx) {
			keys = append(keys, iter.Val())
		}
		if err := iter.Err(); err != nil {
			return err
		}
	}
	if len(keys) == 0 {
		return nil
	}
	return v.client.Del(ctx, keys...).Err()
}

func DeleteAuthCache(ctx context.Context, v *Valkey, tokenID, tokenPrefix string) {
	if v == nil || !v.Available() {
		return
	}
	keys := []string{}
	if tokenID != "" {
		keys = append(keys, authTokenKey(tokenID))
	}
	if tokenPrefix != "" {
		keys = append(keys, authPrefixKey(tokenPrefix))
	}
	if len(keys) > 0 {
		if err := v.client.Del(ctx, keys...).Err(); err != nil && err != redis.Nil {
			log.Printf("valkey delete auth cache: %v", err)
		}
	}
}
