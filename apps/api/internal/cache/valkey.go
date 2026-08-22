package cache

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type Valkey struct {
	client *redis.Client
}

func Connect(ctx context.Context, valkeyURL, password string) (*Valkey, error) {
	valkeyURL = strings.TrimSpace(valkeyURL)
	if valkeyURL == "" {
		return &Valkey{}, nil
	}
	opts, err := redis.ParseURL(valkeyURL)
	if err != nil {
		return nil, err
	}
	if password != "" {
		opts.Password = password
	}
	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Valkey{client: client}, nil
}

func (v *Valkey) Available() bool {
	return v != nil && v.client != nil
}

func (v *Valkey) Close() error {
	if v.client == nil {
		return nil
	}
	return v.client.Close()
}

func (v *Valkey) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	if !v.Available() {
		return true, nil
	}
	count, err := v.client.Incr(ctx, key).Result()
	if err != nil {
		return true, err
	}
	if count == 1 {
		if err := v.client.Expire(ctx, key, window).Err(); err != nil {
			return true, err
		}
	}
	return count <= int64(limit), nil
}

func (v *Valkey) AllowWrite(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	if !v.Available() {
		return false, nil
	}
	return v.Allow(ctx, key, limit, window)
}

const userTagPrefix = "qso:tag:user:"
const hamTagPrefix = "qso:tag:ham:"

func InvalidateQsoUserCache(ctx context.Context, v *Valkey, userID string) {
	if !v.Available() || userID == "" {
		return
	}
	tag := userTagPrefix + userID
	members, err := v.client.SMembers(ctx, tag).Result()
	if err != nil {
		log.Printf("valkey invalidate qso user cache: %v", err)
		return
	}
	keys := append(members, tag)
	if len(keys) > 0 {
		if err := v.client.Del(ctx, keys...).Err(); err != nil {
			log.Printf("valkey invalidate qso user cache: %v", err)
		}
	}
}

func InvalidateHamPublicCache(ctx context.Context, v *Valkey, callsign string) {
	if !v.Available() {
		return
	}
	callsign = strings.TrimSpace(strings.ToUpper(callsign))
	if callsign == "" {
		return
	}
	tag := hamTagPrefix + callsign
	members, err := v.client.SMembers(ctx, tag).Result()
	if err != nil {
		log.Printf("valkey invalidate ham cache: %v", err)
		return
	}
	keys := append(members, tag)
	if len(keys) > 0 {
		if err := v.client.Del(ctx, keys...).Err(); err != nil {
			log.Printf("valkey invalidate ham cache: %v", err)
		}
	}
}

func InvalidateQsoAndHamCache(ctx context.Context, v *Valkey, userID string, callsigns []string) {
	InvalidateQsoUserCache(ctx, v, userID)
	for _, callsign := range callsigns {
		InvalidateHamPublicCache(ctx, v, callsign)
	}
}
