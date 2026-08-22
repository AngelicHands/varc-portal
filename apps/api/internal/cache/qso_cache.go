package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

const QsoListCacheTTL = 300 * time.Second
const QsoItemCacheTTL = 300 * time.Second

func UserTag(userID string) string {
	return userTagPrefix + userID
}

func QsoListCacheKey(userID string, page, pageSize int, filterHash, sortKey, sortDir string) string {
	return fmt.Sprintf(
		"api:qso:list:user:%s:p%d:s%d:f%s:sort%s:%s:v1",
		userID, page, pageSize, filterHash, sortKey, sortDir,
	)
}

func QsoItemCacheKey(userID, qsoID string) string {
	return fmt.Sprintf("api:qso:item:user:%s:id:%s:v1", userID, qsoID)
}

// Aside loads JSON from Valkey or runs loader, stores result with tags on miss.
func Aside[T any](
	ctx context.Context,
	v *Valkey,
	key string,
	tags []string,
	ttl time.Duration,
	loader func() (T, error),
) (T, error) {
	var zero T
	if v != nil && v.Available() {
		raw, err := v.client.Get(ctx, key).Result()
		if err == nil && raw != "" {
			var hit T
			if json.Unmarshal([]byte(raw), &hit) == nil {
				return hit, nil
			}
		}
	}

	value, err := loader()
	if err != nil {
		return zero, err
	}

	if v != nil && v.Available() {
		payload, marshalErr := json.Marshal(value)
		if marshalErr == nil {
			pipe := v.client.Pipeline()
			pipe.Set(ctx, key, payload, ttl)
			tagTTL := ttl + 60*time.Second
			seen := map[string]struct{}{}
			for _, tag := range tags {
				if tag == "" {
					continue
				}
				if _, ok := seen[tag]; ok {
					continue
				}
				seen[tag] = struct{}{}
				pipe.SAdd(ctx, tag, key)
				pipe.Expire(ctx, tag, tagTTL)
			}
			if _, pipeErr := pipe.Exec(ctx); pipeErr != nil {
				log.Printf("valkey set qso cache: %v", pipeErr)
			}
		}
	}

	return value, nil
}
