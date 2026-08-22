package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	MongoURI        string
	ValkeyURL       string
	ValkeyPassword  string
	Port            string
	TokenPepper     string
	PublicURL       string
	RateLimit       int
	RateLimitWindow time.Duration
	RateLimitWrite  int
	CORSOrigins     []string
}

func Load() Config {
	loadSharedEnv()

	pepper := strings.TrimSpace(os.Getenv("API_TOKEN_PEPPER"))
	if pepper == "" {
		pepper = strings.TrimSpace(os.Getenv("AUTH_SECRET"))
	}

	port := strings.TrimSpace(os.Getenv("API_PORT"))
	if port == "" {
		port = "3100"
	}

	publicURL := strings.TrimSpace(os.Getenv("API_PUBLIC_URL"))
	if publicURL == "" {
		publicURL = "http://localhost:3100"
	}

	rateLimit := parsePositiveInt(os.Getenv("API_RATE_LIMIT"), 120)
	rateLimitWrite := parsePositiveInt(os.Getenv("API_RATE_LIMIT_WRITE"), 30)
	rateWindow := parseDuration(os.Getenv("API_RATE_LIMIT_WINDOW"), time.Minute)

	var corsOrigins []string
	if raw := strings.TrimSpace(os.Getenv("API_CORS_ORIGINS")); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			origin := strings.TrimSpace(part)
			if origin != "" {
				corsOrigins = append(corsOrigins, origin)
			}
		}
	}

	return Config{
		MongoURI:        strings.TrimSpace(os.Getenv("MONGODB_URI")),
		ValkeyURL:       strings.TrimSpace(os.Getenv("VALKEY_URL")),
		ValkeyPassword:  strings.TrimSpace(os.Getenv("VALKEY_PASSWORD")),
		Port:            port,
		TokenPepper:     pepper,
		PublicURL:       publicURL,
		RateLimit:       rateLimit,
		RateLimitWindow: rateWindow,
		RateLimitWrite:  rateLimitWrite,
		CORSOrigins:     corsOrigins,
	}
}

func parsePositiveInt(raw string, fallback int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func parseDuration(raw string, fallback time.Duration) time.Duration {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil && d > 0 {
		return d
	}
	if strings.HasSuffix(raw, "m") {
		if n, err := strconv.Atoi(strings.TrimSuffix(raw, "m")); err == nil && n > 0 {
			return time.Duration(n) * time.Minute
		}
	}
	return fallback
}

// loadSharedEnv reads the repo-root .env the same way Node's --env-file=.env does,
// without shell "source" (which breaks on unquoted spaces in values).
func loadSharedEnv() {
	if explicit := strings.TrimSpace(os.Getenv("ENV_FILE")); explicit != "" {
		_ = godotenv.Load(explicit)
		return
	}

	candidates := []string{".env", "../.env", "../../.env"}
	if wd, err := os.Getwd(); err == nil {
		dir := wd
		for range 4 {
			candidates = append(candidates, filepath.Join(dir, ".env"))
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	seen := map[string]struct{}{}
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		if _, err := os.Stat(path); err != nil {
			continue
		}
		_ = godotenv.Load(path)
	}
}
