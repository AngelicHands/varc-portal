package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type WorkerConfig struct {
	MongoURI         string
	ValkeyURL        string
	ValkeyPassword   string
	EmailPoll        time.Duration
	BackupPoll       time.Duration
	ImportExportPoll time.Duration
	WorkerID         string
	AppVersion       string
	PublicBaseURL    string
	PortalInternalURL string
	WorkerInternalSecret string
	CloudflareMail   CloudflareMailConfig
	MailRateLimit    MailRateLimitConfig
	Storage          StorageConfig
	BackupArtifacts  BackupArtifactConfig
}

type CloudflareMailConfig struct {
	APIToken  string
	AccountID string
	From      string
	Configured bool
}

type MailRateLimitConfig struct {
	MaxPerDay          *int
	PerClientLimit     *int
	PerClientWindowSec int
}

type StorageConfig struct {
	Driver         string // local | s3
	UploadDir      string
	PublicBaseURL  string
	S3Endpoint     string
	S3Region       string
	S3Bucket       string
	S3AccessKey    string
	S3SecretKey    string
	S3ForcePath    bool
	S3PublicURL    string
}

type BackupArtifactConfig struct {
	Driver      string
	ArtifactDir string
	S3Bucket    string
	S3Prefix    string
	MaxAgeDays  int
	MaxCount    int
}

func LoadWorker() WorkerConfig {
	loadSharedEnv()

	emailPoll := parseDuration(os.Getenv("EMAIL_WORKER_POLL_MS"), 3*time.Second)
	if strings.TrimSpace(os.Getenv("EMAIL_WORKER_POLL_MS")) != "" {
		if ms, err := time.ParseDuration(strings.TrimSpace(os.Getenv("EMAIL_WORKER_POLL_MS")) + "ms"); err == nil && ms >= 2*time.Second {
			emailPoll = ms
		}
	}
	backupPoll := parseDuration(os.Getenv("BACKUP_WORKER_POLL_MS"), 5*time.Second)
	if strings.TrimSpace(os.Getenv("BACKUP_WORKER_POLL_MS")) != "" {
		if ms, err := time.ParseDuration(strings.TrimSpace(os.Getenv("BACKUP_WORKER_POLL_MS")) + "ms"); err == nil && ms >= 3*time.Second {
			backupPoll = ms
		}
	}
	importExportPoll := parseDuration(os.Getenv("IMPORT_EXPORT_WORKER_POLL_MS"), 15*time.Second)
	if strings.TrimSpace(os.Getenv("IMPORT_EXPORT_WORKER_POLL_MS")) != "" {
		if ms, err := time.ParseDuration(strings.TrimSpace(os.Getenv("IMPORT_EXPORT_WORKER_POLL_MS")) + "ms"); err == nil && ms >= 5*time.Second {
			importExportPoll = ms
		}
	}

	cfToken := strings.TrimSpace(os.Getenv("CF_MAIL_API_TOKEN"))
	cfAccount := strings.TrimSpace(os.Getenv("CF_MAIL_ACCOUNT_ID"))
	cfFrom := strings.TrimSpace(os.Getenv("CF_MAIL_FROM"))

	storage := loadStorageConfig()
	artifacts := loadBackupArtifactConfig(storage)

	return WorkerConfig{
		MongoURI:       strings.TrimSpace(os.Getenv("MONGODB_URI")),
		ValkeyURL:      strings.TrimSpace(os.Getenv("VALKEY_URL")),
		ValkeyPassword: strings.TrimSpace(os.Getenv("VALKEY_PASSWORD")),
		WorkerID:       resolveWorkerID(),
		EmailPoll:            emailPoll,
		BackupPoll:           backupPoll,
		ImportExportPoll:     importExportPoll,
		AppVersion:           resolveAppVersion(),
		PublicBaseURL:        resolvePublicBaseURL(),
		PortalInternalURL:    resolvePortalInternalURL(),
		WorkerInternalSecret: resolveWorkerInternalSecret(),
		CloudflareMail: CloudflareMailConfig{
			APIToken:   cfToken,
			AccountID:  cfAccount,
			From:       cfFrom,
			Configured: cfToken != "" && cfAccount != "" && cfFrom != "",
		},
		MailRateLimit:   loadMailRateLimitConfig(),
		Storage:         storage,
		BackupArtifacts: artifacts,
	}
}

func loadStorageConfig() StorageConfig {
	driver := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_DRIVER")))
	if driver == "" {
		driver = "local"
	}
	uploadDir := strings.TrimSpace(os.Getenv("UPLOAD_DIR"))
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	publicBase := strings.TrimSpace(strings.TrimSuffix(os.Getenv("MEDIA_PUBLIC_BASE_URL"), "/"))
	forcePath := !parseBoolFalse(os.Getenv("S3_FORCE_PATH_STYLE"))

	return StorageConfig{
		Driver:        driver,
		UploadDir:     uploadDir,
		PublicBaseURL: publicBase,
		S3Endpoint:    strings.TrimSpace(os.Getenv("S3_ENDPOINT")),
		S3Region:      strings.TrimSpace(os.Getenv("S3_REGION")),
		S3Bucket:      strings.TrimSpace(os.Getenv("S3_BUCKET")),
		S3AccessKey:   strings.TrimSpace(os.Getenv("S3_ACCESS_KEY")),
		S3SecretKey:   strings.TrimSpace(os.Getenv("S3_SECRET_KEY")),
		S3ForcePath:   forcePath,
		S3PublicURL:   strings.TrimSuffix(strings.TrimSpace(os.Getenv("S3_PUBLIC_URL")), "/"),
	}
}

func loadBackupArtifactConfig(storage StorageConfig) BackupArtifactConfig {
	maxAge := parsePositiveInt(os.Getenv("BACKUP_MAX_AGE_DAYS"), 7)
	maxCount := parsePositiveInt(os.Getenv("BACKUP_MAX_COUNT"), 10)
	artifactDir := strings.TrimSpace(os.Getenv("BACKUP_ARTIFACT_DIR"))
	if artifactDir == "" {
		artifactDir = "./.backup-artifacts"
	}
	prefix := strings.Trim(strings.TrimSpace(os.Getenv("BACKUP_S3_PREFIX")), "/")
	if prefix == "" {
		prefix = "backup-artifacts"
	}
	bucket := strings.TrimSpace(os.Getenv("BACKUP_S3_BUCKET"))
	if bucket == "" {
		bucket = storage.S3Bucket
	}

	return BackupArtifactConfig{
		Driver:      storage.Driver,
		ArtifactDir: artifactDir,
		S3Bucket:    bucket,
		S3Prefix:    prefix,
		MaxAgeDays:  maxAge,
		MaxCount:    maxCount,
	}
}

func loadMailRateLimitConfig() MailRateLimitConfig {
	perClient := parseOptionalPositiveInt(os.Getenv("CF_MAIL_RATE_LIMIT"))
	maxPerDay := parseOptionalPositiveInt(os.Getenv("CF_MAIL_MAX"))
	windowSec := 3600
	if raw := strings.TrimSpace(os.Getenv("CF_MAIL_RATE_LIMIT_WINDOW")); raw != "" {
		if d := parseMailRateWindow(raw); d > 0 {
			windowSec = int(d.Seconds())
		}
	} else if perClient != nil {
		windowSec = 3600
	} else {
		windowSec = 86400
	}
	return MailRateLimitConfig{
		MaxPerDay:          maxPerDay,
		PerClientLimit:     perClient,
		PerClientWindowSec: windowSec,
	}
}

func parseMailRateWindow(raw string) time.Duration {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if len(raw) < 2 {
		return 0
	}
	unit := raw[len(raw)-1]
	numStr := raw[:len(raw)-1]
	n := parsePositiveInt(numStr, 0)
	if n <= 0 {
		return 0
	}
	switch unit {
	case 's':
		return time.Duration(n) * time.Second
	case 'm':
		return time.Duration(n) * time.Minute
	case 'h':
		return time.Duration(n) * time.Hour
	case 'd':
		return time.Duration(n) * 24 * time.Hour
	default:
		return 0
	}
}

func parseOptionalPositiveInt(raw string) *int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	n := parsePositiveInt(raw, 0)
	if n <= 0 {
		return nil
	}
	return &n
}

func parseBoolFalse(raw string) bool {
	raw = strings.TrimSpace(strings.ToLower(raw))
	return raw == "false" || raw == "0" || raw == "no"
}

func resolvePublicBaseURL() string {
	for _, key := range []string{"AUTH_URL", "NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"} {
		if v := strings.TrimSuffix(strings.TrimSpace(os.Getenv(key)), "/"); v != "" {
			return v
		}
	}
	return "http://localhost:3099"
}

func resolveAppVersion() string {
	if v := strings.TrimSpace(os.Getenv("APP_VERSION")); v != "" {
		return v
	}
	return "0.0.0"
}

func resolveWorkerID() string {
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		hostname = "worker"
	}
	return fmt.Sprintf("%s:%d", hostname, os.Getpid())
}

func resolvePortalInternalURL() string {
	for _, key := range []string{"PORTAL_INTERNAL_URL", "AUTH_URL", "NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"} {
		if v := strings.TrimSuffix(strings.TrimSpace(os.Getenv(key)), "/"); v != "" {
			return v
		}
	}
	return "http://localhost:3099"
}

func resolveWorkerInternalSecret() string {
	if v := strings.TrimSpace(os.Getenv("WORKER_INTERNAL_SECRET")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("AUTH_SECRET"))
}
