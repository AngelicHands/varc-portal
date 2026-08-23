package cache

import (
	"context"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
)

const cmsGenKey = "cms:gen"

var slugSanitizer = regexp.MustCompile(`[^a-z0-9]+`)

var defaultCmsTags = []string{
	"branding", "settings", "menus", "pages", "articles",
	"categories", "forms", "templates", "callsigns",
}

func InvalidateCmsTags(ctx context.Context, v *Valkey, tags ...string) {
	if !v.Available() {
		return
	}
	unique := uniqueStrings(tags)
	if len(unique) == 0 {
		unique = defaultCmsTags
	}

	prevGen, err := v.client.Get(ctx, cmsGenKey).Int64()
	if err != nil {
		prevGen = 0
	}
	if err := v.client.Incr(ctx, cmsGenKey).Err(); err != nil {
		log.Printf("cms cache invalidate: %v", err)
		return
	}

	keysToDelete := make(map[string]struct{})
	for _, tag := range unique {
		if tag == "" {
			continue
		}
		tKey := versionedTagKey(prevGen, tag)
		members, err := v.client.SMembers(ctx, tKey).Result()
		if err == nil {
			for _, m := range members {
				keysToDelete[m] = struct{}{}
			}
		}
		keysToDelete[tKey] = struct{}{}
		keysToDelete["tag:"+tag] = struct{}{}
	}
	if len(keysToDelete) == 0 {
		return
	}
	list := make([]string, 0, len(keysToDelete))
	for k := range keysToDelete {
		list = append(list, k)
	}
	if err := v.client.Del(ctx, list...).Err(); err != nil {
		log.Printf("cms cache invalidate del: %v", err)
	}
}

func versionedTagKey(gen int64, tag string) string {
	return "g" + itoa(gen) + ":tag:" + tag
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func uniqueStrings(items []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func AllowMailSend(ctx context.Context, v *Valkey, cfg config.MailRateLimitConfig, clientKey string) (bool, string) {
	if cfg.MaxPerDay == nil && cfg.PerClientLimit == nil {
		return true, ""
	}
	if !v.Available() {
		return true, ""
	}
	if cfg.MaxPerDay != nil {
		count, err := incrWithExpire(ctx, v, "rate:mail:global", 86400)
		if err == nil && count > int64(*cfg.MaxPerDay) {
			return false, "Daily email sending limit reached for this application"
		}
	}
	if cfg.PerClientLimit != nil {
		key := "rate:mail:client:" + normalizeClientKey(clientKey)
		count, err := incrWithExpire(ctx, v, key, cfg.PerClientWindowSec)
		if err == nil && count > int64(*cfg.PerClientLimit) {
			return false, "Too many confirmation emails from your connection. Please try again later."
		}
	}
	return true, ""
}

func incrWithExpire(ctx context.Context, v *Valkey, key string, ttlSec int) (int64, error) {
	count, err := v.client.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if count == 1 {
		_ = v.client.Expire(ctx, key, time.Duration(ttlSec)*time.Second).Err()
	}
	return count, nil
}

func normalizeClientKey(clientKey string) string {
	s := strings.ToLower(strings.TrimSpace(clientKey))
	s = slugSanitizer.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "unknown"
	}
	if len(s) > 80 {
		return s[:80]
	}
	return s
}
