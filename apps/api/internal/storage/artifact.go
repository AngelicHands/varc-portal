package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
)

func newS3Client(cfg config.StorageConfig) (*s3.Client, error) {
	if cfg.S3Endpoint == "" || cfg.S3AccessKey == "" || cfg.S3SecretKey == "" {
		return nil, fmt.Errorf("s3 not configured")
	}
	region := cfg.S3Region
	if region == "" {
		region = "us-east-1"
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.S3Endpoint)
		o.UsePathStyle = cfg.S3ForcePath
		// S3-compatible stores (e.g. MinIO) often reject default CRC32 checksum trailers.
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return client, nil
}

func getS3Object(cfg config.StorageConfig, key string) (*ObjectReader, error) {
	client, err := newS3Client(cfg)
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("not found")
	}
	var size int64
	if out.ContentLength != nil {
		size = *out.ContentLength
	}
	ct := ContentTypeForKey(key)
	if out.ContentType != nil && *out.ContentType != "" {
		ct = *out.ContentType
	}
	return &ObjectReader{Body: out.Body, ContentType: ct, Size: size}, nil
}

func putS3Object(cfg config.StorageConfig, key string, body io.Reader, contentType string) error {
	client, err := newS3Client(cfg)
	if err != nil {
		return err
	}
	input := &s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3Bucket),
		Key:         aws.String(key),
		Body:        body,
		ContentType: aws.String(contentType),
	}
	if stater, ok := body.(interface{ Stat() (os.FileInfo, error) }); ok {
		if info, statErr := stater.Stat(); statErr == nil && info.Size() >= 0 {
			input.ContentLength = aws.Int64(info.Size())
		}
	}
	_, err = client.PutObject(context.Background(), input)
	return err
}

func deleteS3Object(cfg config.StorageConfig, key string) error {
	client, err := newS3Client(cfg)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	return err
}

func assertArtifactKey(key string) (string, error) {
	normalized := strings.TrimPrefix(strings.ReplaceAll(key, "\\", "/"), "/")
	if normalized == "" ||
		strings.Contains(normalized, "..") ||
		strings.Contains(normalized, "\x00") ||
		filepath.IsAbs(normalized) ||
		!isSafeKeyChars(normalized) {
		return "", fmt.Errorf("invalid backup artifact key")
	}
	return normalized, nil
}

func sanitizeArtifactName(name string) string {
	base := filepath.Base(name)
	var b strings.Builder
	for _, r := range base {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "backup.zip"
	}
	if len(out) > 120 {
		return out[:120]
	}
	return out
}

func BuildBackupArtifactKey(fileName string, now time.Time) string {
	id := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	return fmt.Sprintf("%04d/%02d/%02d/%s-%s",
		now.UTC().Year(), int(now.UTC().Month()), now.UTC().Day(),
		id, sanitizeArtifactName(fileName))
}

type StoredArtifact struct {
	Key         string
	ContentType string
	Size        int64
}

func PutBackupArtifactFile(cfg config.WorkerConfig, key, filePath, contentType string) (StoredArtifact, error) {
	safe, err := assertArtifactKey(key)
	if err != nil {
		return StoredArtifact{}, err
	}
	f, err := os.Open(filePath)
	if err != nil {
		return StoredArtifact{}, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return StoredArtifact{}, err
	}
	stored, err := putBackupArtifactStream(cfg, safe, f, contentType)
	if err != nil {
		return StoredArtifact{}, err
	}
	if stored.Size == 0 {
		stored.Size = info.Size()
	}
	return stored, nil
}

func PutBackupArtifactStream(cfg config.WorkerConfig, key string, body io.Reader, contentType string) (StoredArtifact, error) {
	safe, err := assertArtifactKey(key)
	if err != nil {
		return StoredArtifact{}, err
	}
	return putBackupArtifactStream(cfg, safe, body, contentType)
}

func putBackupArtifactStream(cfg config.WorkerConfig, key string, body io.Reader, contentType string) (StoredArtifact, error) {
	art := cfg.BackupArtifacts
	if art.Driver == "local" {
		absolute := filepath.Join(art.ArtifactDir, filepath.FromSlash(key))
		if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
			return StoredArtifact{}, err
		}
		f, err := os.Create(absolute)
		if err != nil {
			return StoredArtifact{}, err
		}
		defer f.Close()
		n, err := io.Copy(f, body)
		if err != nil {
			return StoredArtifact{}, err
		}
		return StoredArtifact{Key: key, ContentType: contentType, Size: n}, nil
	}
	client, err := newS3Client(cfg.Storage)
	if err != nil {
		return StoredArtifact{}, err
	}
	s3Key := art.S3Prefix + "/" + key
	input := &s3.PutObjectInput{
		Bucket:      aws.String(art.S3Bucket),
		Key:         aws.String(s3Key),
		Body:        body,
		ContentType: aws.String(contentType),
	}
	if stater, ok := body.(interface{ Stat() (os.FileInfo, error) }); ok {
		if info, statErr := stater.Stat(); statErr == nil && info.Size() >= 0 {
			input.ContentLength = aws.Int64(info.Size())
		}
	}
	_, err = client.PutObject(context.Background(), input)
	if err != nil {
		return StoredArtifact{}, err
	}
	return StoredArtifact{Key: key, ContentType: contentType, Size: 0}, nil
}

func GetBackupArtifactStream(cfg config.WorkerConfig, key string) (io.ReadCloser, error) {
	safe, err := assertArtifactKey(key)
	if err != nil {
		return nil, err
	}
	art := cfg.BackupArtifacts
	if art.Driver == "local" {
		absolute := filepath.Join(art.ArtifactDir, filepath.FromSlash(safe))
		resolvedRoot, _ := filepath.Abs(art.ArtifactDir)
		resolvedFile, _ := filepath.Abs(absolute)
		if !strings.HasPrefix(resolvedFile, resolvedRoot+string(os.PathSeparator)) && resolvedFile != resolvedRoot {
			return nil, fmt.Errorf("invalid backup artifact key")
		}
		return os.Open(resolvedFile)
	}
	client, err := newS3Client(cfg.Storage)
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(art.S3Bucket),
		Key:    aws.String(art.S3Prefix + "/" + safe),
	})
	if err != nil {
		return nil, fmt.Errorf("not found")
	}
	return out.Body, nil
}

func DeleteBackupArtifact(cfg config.WorkerConfig, key string) error {
	safe, err := assertArtifactKey(key)
	if err != nil {
		return err
	}
	art := cfg.BackupArtifacts
	if art.Driver == "local" {
		absolute := filepath.Join(art.ArtifactDir, filepath.FromSlash(safe))
		if err := os.Remove(absolute); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	client, err := newS3Client(cfg.Storage)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(art.S3Bucket),
		Key:    aws.String(art.S3Prefix + "/" + safe),
	})
	return err
}
