package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
)

func ContentTypeForKey(key string) string {
	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain"
	case ".zip":
		return "application/zip"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".ppt":
		return "application/vnd.ms-powerpoint"
	case ".pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	default:
		return "application/octet-stream"
	}
}

func AssertSafeKey(key string) (string, error) {
	normalized := strings.TrimPrefix(strings.ReplaceAll(key, "\\", "/"), "/")
	if normalized == "" ||
		strings.Contains(normalized, "..") ||
		strings.Contains(normalized, "\x00") ||
		filepath.IsAbs(normalized) ||
		(len(normalized) >= 2 && normalized[1] == ':') ||
		!isSafeKeyChars(normalized) {
		return "", fmt.Errorf("invalid media key")
	}
	return normalized, nil
}

func isSafeKeyChars(s string) bool {
	for _, r := range s {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '.' || r == '_' || r == '-' || r == '/' {
			continue
		}
		return false
	}
	return true
}

func PublicURLForObjectKey(cfg config.StorageConfig, key string) (string, error) {
	safe, err := AssertSafeKey(key)
	if err != nil {
		return "", err
	}
	if cfg.Driver == "s3" {
		return cfg.S3PublicURL + "/" + safe, nil
	}
	pathURL := "/media/" + safe
	if cfg.PublicBaseURL != "" {
		return cfg.PublicBaseURL + pathURL, nil
	}
	return pathURL, nil
}

func SourcePublicMediaBaseURL(cfg config.StorageConfig) string {
	sample, _ := PublicURLForObjectKey(cfg, "sample.txt")
	if strings.HasSuffix(sample, "/media/sample.txt") {
		return strings.TrimSuffix(sample, "/media/sample.txt")
	}
	return strings.TrimSuffix(sample, "sample.txt")
}

type ObjectReader struct {
	Body        io.ReadCloser
	ContentType string
	Size        int64
}

func GetObjectStream(cfg config.StorageConfig, key string) (*ObjectReader, error) {
	safe, err := AssertSafeKey(key)
	if err != nil {
		return nil, err
	}
	if cfg.Driver == "local" {
		absolute := filepath.Join(cfg.UploadDir, filepath.FromSlash(safe))
		resolvedRoot, _ := filepath.Abs(cfg.UploadDir)
		resolvedFile, _ := filepath.Abs(absolute)
		if !strings.HasPrefix(resolvedFile, resolvedRoot+string(os.PathSeparator)) && resolvedFile != resolvedRoot {
			return nil, fmt.Errorf("invalid media key")
		}
		f, err := os.Open(resolvedFile)
		if err != nil {
			return nil, fmt.Errorf("not found")
		}
		info, _ := f.Stat()
		var size int64
		if info != nil {
			size = info.Size()
		}
		return &ObjectReader{Body: f, ContentType: ContentTypeForKey(safe), Size: size}, nil
	}
	return getS3Object(cfg, safe)
}

func PutObjectStream(cfg config.StorageConfig, key string, body io.Reader, contentType string) error {
	safe, err := AssertSafeKey(key)
	if err != nil {
		return err
	}
	if cfg.Driver == "local" {
		absolute := filepath.Join(cfg.UploadDir, filepath.FromSlash(safe))
		if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
			return err
		}
		f, err := os.Create(absolute)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(f, body)
		return err
	}
	return putS3Object(cfg, safe, body, contentType)
}

func DeleteObject(cfg config.StorageConfig, key string) error {
	safe, err := AssertSafeKey(key)
	if err != nil {
		return err
	}
	if cfg.Driver == "local" {
		absolute := filepath.Join(cfg.UploadDir, filepath.FromSlash(safe))
		resolvedRoot, _ := filepath.Abs(cfg.UploadDir)
		resolvedFile, _ := filepath.Abs(absolute)
		if !strings.HasPrefix(resolvedFile, resolvedRoot+string(os.PathSeparator)) && resolvedFile != resolvedRoot {
			return fmt.Errorf("invalid media key")
		}
		if err := os.Remove(resolvedFile); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	return deleteS3Object(cfg, safe)
}
