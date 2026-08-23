package backup

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/mail"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/storage"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Processor struct {
	store  *JobStore
	cfg    config.WorkerConfig
	valkey *cache.Valkey
}

func NewProcessor(store *JobStore, cfg config.WorkerConfig, valkey *cache.Valkey) *Processor {
	return &Processor{store: store, cfg: cfg, valkey: valkey}
}

func (p *Processor) Process(ctx context.Context, job *Job) {
	if err := p.run(ctx, job); err != nil {
		if _, ok := err.(cancelledError); ok {
			return
		}
		msg := err.Error()
		if msg == "" {
			msg = "Backup job failed"
		}
		p.store.MarkFailed(ctx, job.ID, msg)
	}
}

func (p *Processor) run(ctx context.Context, job *Job) error {
	if job.Kind == "backup" {
		archivePath, fileName, manifest, err := p.buildBackupArchive(ctx, job)
		if err != nil {
			return err
		}
		defer os.RemoveAll(filepath.Dir(archivePath))

		if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
			return err
		}

		info, err := os.Stat(archivePath)
		if err != nil {
			return err
		}
		artifactKey := storage.BuildBackupArtifactKey(fileName, time.Now())
		stored, err := storage.PutBackupArtifactFile(p.cfg, artifactKey, archivePath, "application/zip")
		if err != nil {
			return err
		}
		size := stored.Size
		if size == 0 {
			size = info.Size()
		}

		msg := "Backup ready"
		if len(manifest.MissingMedia) > 0 {
			msg = fmt.Sprintf("Completed with %d missing media file(s)", len(manifest.MissingMedia))
		}
		p.store.MarkSucceeded(ctx, job.ID, bson.M{
			"message":             msg,
			"artifactKey":         artifactKey,
			"artifactFileName":    fileName,
			"artifactContentType": "application/zip",
			"artifactSize":        size,
		})

		downloadURL := fmt.Sprintf("%s/api/admin/backup/artifacts/%s", p.cfg.PublicBaseURL, job.ID.Hex())
		p.sendBackupReadyEmail(ctx, job.RequestedByEmail, downloadURL, fileName)
		p.store.MarkEmailSent(ctx, job.ID)
		return p.cleanupArtifacts(ctx)
	}

	if err := p.restoreBackupArchive(ctx, job); err != nil {
		return err
	}
	if err := p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
		return err
	}
	if job.SourceArtifactKey != "" {
		_ = storage.DeleteBackupArtifact(p.cfg, job.SourceArtifactKey)
	}
	p.store.MarkSucceeded(ctx, job.ID, bson.M{"message": "Restore completed"})
	return p.cleanupArtifacts(ctx)
}

func (p *Processor) sendBackupReadyEmail(ctx context.Context, to, downloadURL, fileName string) {
	if !p.cfg.CloudflareMail.Configured {
		return
	}
	subject := "VARC portal backup ready — " + fileName
	text := strings.Join([]string{
		"Your portal backup is ready.",
		"",
		"File: " + fileName,
		"Download: " + downloadURL,
		"",
		"The link requires portal admin access.",
	}, "\n")
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#14201a;">
  <p>Your portal backup is ready.</p>
  <p><strong>File:</strong> %s</p>
  <p><a href="%s">Download backup</a></p>
  <p style="color:#4b5563;">The link requires portal admin access.</p>
</body>
</html>`, mail.EscapeHTML(fileName), mail.EscapeHTML(downloadURL))

	clientKey := "backup:" + strings.ToLower(strings.TrimSpace(to))
	if allowed, _ := cache.AllowMailSend(ctx, p.valkey, p.cfg.MailRateLimit, clientKey); !allowed {
		log.Printf("[backup-worker] backup email rate limited for %s", to)
		return
	}
	result := mail.SendCloudflare(ctx, p.cfg, mail.SendInput{
		To: to, Subject: subject, Text: text, HTML: html,
	}, clientKey)
	p.recordBackupMail(ctx, to, subject, text, html, result)
	if !result.OK {
		log.Printf("[backup-worker] backup email failed: %s", result.Error)
	}
}

func (p *Processor) recordBackupMail(ctx context.Context, to, subject, text, html string, result mail.SendResult) {
	status := "sent"
	errMsg := ""
	if !result.OK {
		status = "failed"
		errMsg = result.Error
	}
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	_, _ = p.store.DB.Collection("mailmessages").InsertOne(ctx, bson.M{
		"to":               strings.TrimSpace(to),
		"from":             result.From,
		"subject":          subject,
		"text":             text,
		"html":             html,
		"status":           status,
		"kind":             "backup_artifact",
		"error":            errMsg,
		"formId":           nil,
		"formNameSnapshot": "",
		"submissionId":     nil,
		"createdAt":        time.Now(),
		"updatedAt":        time.Now(),
	})
}

func (p *Processor) cleanupArtifacts(ctx context.Context) error {
	maxAge := p.cfg.BackupArtifacts.MaxAgeDays
	maxCount := p.cfg.BackupArtifacts.MaxCount
	cutoff := time.Now().Add(-time.Duration(maxAge) * 24 * time.Hour)

	oldCursor, err := p.store.DB.Collection("backupjobs").Find(ctx, bson.M{
		"artifactKey": bson.M{"$ne": ""},
		"finishedAt":  bson.M{"$lt": cutoff},
	})
	if err == nil {
		defer oldCursor.Close(ctx)
		for oldCursor.Next(ctx) {
			var doc struct {
				ID                primitive.ObjectID `bson:"_id"`
				ArtifactKey       string             `bson:"artifactKey"`
				SourceArtifactKey string             `bson:"sourceArtifactKey"`
			}
			if oldCursor.Decode(&doc) != nil {
				continue
			}
			if doc.ArtifactKey != "" {
				_ = storage.DeleteBackupArtifact(p.cfg, doc.ArtifactKey)
			}
			if doc.SourceArtifactKey != "" {
				_ = storage.DeleteBackupArtifact(p.cfg, doc.SourceArtifactKey)
			}
			_, _ = p.store.DB.Collection("backupjobs").UpdateByID(ctx, doc.ID, bson.M{"$set": bson.M{
				"artifactKey": "", "sourceArtifactKey": "",
			}})
		}
	}

	succeeded, err := p.store.DB.Collection("backupjobs").Find(ctx, bson.M{
		"kind": "backup", "status": "succeeded", "artifactKey": bson.M{"$ne": ""},
	}, options.Find().SetSort(bson.D{{Key: "finishedAt", Value: -1}, {Key: "createdAt", Value: -1}}))
	if err != nil {
		return err
	}
	defer succeeded.Close(ctx)
	type row struct {
		id  primitive.ObjectID
		key string
	}
	var rows []row
	for succeeded.Next(ctx) {
		var doc struct {
			ID          primitive.ObjectID `bson:"_id"`
			ArtifactKey string             `bson:"artifactKey"`
		}
		if succeeded.Decode(&doc) != nil {
			continue
		}
		rows = append(rows, row{id: doc.ID, key: doc.ArtifactKey})
	}
	if len(rows) <= maxCount {
		return nil
	}
	for _, doc := range rows[maxCount:] {
		_ = storage.DeleteBackupArtifact(p.cfg, doc.key)
		_, _ = p.store.DB.Collection("backupjobs").UpdateByID(ctx, doc.id, bson.M{"$set": bson.M{"artifactKey": ""}})
	}
	return nil
}
