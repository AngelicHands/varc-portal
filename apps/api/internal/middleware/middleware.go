package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/auth"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/respond"
	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic: %v", rec)
				respond.Error(w, http.StatusInternalServerError, "Something went wrong")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			buf := make([]byte, 8)
			_, _ = rand.Read(buf)
			id = hex.EncodeToString(buf)
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r)
	})
}

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/v1/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func CORS(cfg config.Config) func(http.Handler) http.Handler {
	allowed := cfg.CORSOrigins
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(allowed) == 0 {
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			for _, item := range allowed {
				if origin == item {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Vary", "Origin")
					break
				}
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RateLimit(cfg config.Config, valkey *cache.Valkey) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/v1/") {
				next.ServeHTTP(w, r)
				return
			}
			ip := clientIP(r)
			key := fmt.Sprintf("rate:api:ip:%s", ip)
			allowed, err := valkey.Allow(r.Context(), key, 30, time.Minute)
			if err != nil {
				log.Printf("rate limit ip: %v", err)
			}
			if !allowed {
				respond.Error(w, http.StatusTooManyRequests, "Too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func AuthenticatedRateLimit(cfg config.Config, valkey *cache.Valkey) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal := auth.PrincipalFromContext(r.Context())
			if principal.TokenID == "" {
				next.ServeHTTP(w, r)
				return
			}
			key := fmt.Sprintf("rate:api:token:%s", principal.TokenID)
			allowed, err := valkey.Allow(r.Context(), key, cfg.RateLimit, cfg.RateLimitWindow)
			if err != nil {
				log.Printf("rate limit token: %v", err)
			}
			if !allowed {
				respond.Error(w, http.StatusTooManyRequests, "Too many requests")
				return
			}
			if r.Method == http.MethodPost || r.Method == http.MethodPatch || r.Method == http.MethodDelete {
				writeKey := key + ":write"
				writeAllowed, writeErr := valkey.AllowWrite(r.Context(), writeKey, cfg.RateLimitWrite, cfg.RateLimitWindow)
				if writeErr != nil {
					log.Printf("rate limit write: %v", writeErr)
				}
				if !writeAllowed {
					respond.Error(w, http.StatusTooManyRequests, "Too many requests")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func BearerAuth(cfg config.Config, store *appmongo.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
				respond.Error(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			principal, err := auth.AuthenticateBearer(r.Context(), store, header, cfg.TokenPepper)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), principal)))
		})
	}
}

func clientIP(r *http.Request) string {
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx >= 0 {
		return host[:idx]
	}
	return host
}
