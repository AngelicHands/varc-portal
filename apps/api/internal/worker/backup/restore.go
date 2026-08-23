package backup

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/storage"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func (p *Processor) restoreBackupArchive(ctx context.Context, job *Job) error {
	tempDir, err := os.MkdirTemp("", "varc-restore-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
		return err
	}

	currentKeys, err := p.collectManagedKeys(ctx)
	if err != nil {
		return err
	}

	zipPath, err := p.downloadSourceZip(ctx, job, tempDir)
	if err != nil {
		return err
	}

	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()

	manifest, err := readManifest(zr)
	if err != nil {
		return err
	}

	collectionEntries := map[string]*zip.File{}
	mediaCount := 0
	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, "mongo/") {
			name := strings.TrimPrefix(f.Name, "mongo/")
			name = strings.TrimSuffix(name, ".jsonl")
			collectionEntries[name] = f
		}
		if strings.HasPrefix(f.Name, "media/") {
			mediaCount++
		}
	}

	for name := range collectionEntries {
		if !containsString(BackupCollectionNames, name) {
			return fmt.Errorf("backup contains unsupported collection: %s", name)
		}
	}

	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"phase":            "restoring-mongo",
		"message":          "Replacing MongoDB collections",
		"collectionsDone":  0,
		"collectionsTotal": len(BackupCollectionNames),
		"mediaDone":        0,
		"mediaTotal":       mediaCount,
	})

	collectionsDone := 0
	for _, collectionName := range BackupCollectionNames {
		if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
			return err
		}
		entry := collectionEntries[collectionName]
		if entry != nil {
			if err = p.restoreCollectionFromEntry(ctx, collectionName, entry); err != nil {
				return err
			}
			p.store.UpdateProgress(ctx, job.ID, bson.M{
				"collectionsDone": collectionsDone + 1,
				"message":         "Restored " + collectionName,
			})
		} else {
			if err = p.clearCollection(ctx, collectionName); err != nil {
				return err
			}
			p.store.UpdateProgress(ctx, job.ID, bson.M{
				"collectionsDone": collectionsDone + 1,
				"message":         "Cleared " + collectionName + " (not in backup)",
			})
		}
		collectionsDone++
	}

	restoredKeys, err := p.restoreMediaEntries(ctx, job.ID, zr)
	if err != nil {
		return err
	}
	p.removeOldManagedKeys(currentKeys, restoredKeys)

	cache.InvalidateCmsTags(ctx, p.valkey)

	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"phase":   "finalizing",
		"message": "Restore completed from " + manifest.AppVersion,
	})
	return nil
}

func readManifest(zr *zip.ReadCloser) (Manifest, error) {
	for _, f := range zr.File {
		if f.Name != "manifest.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return Manifest{}, err
		}
		raw, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return Manifest{}, err
		}
		var manifest Manifest
		if err := json.Unmarshal(raw, &manifest); err != nil {
			return Manifest{}, err
		}
		if manifest.FormatVersion != 1 {
			return Manifest{}, fmt.Errorf("unsupported backup format")
		}
		return manifest, nil
	}
	return Manifest{}, fmt.Errorf("backup manifest is missing")
}

func (p *Processor) downloadSourceZip(ctx context.Context, job *Job, tempDir string) (string, error) {
	targetPath := filepath.Join(tempDir, sanitizeUploadName(job.SourceFileName))
	msg := "Reading uploaded backup"
	if job.SourceType == "remote" {
		msg = "Downloading remote backup"
	}
	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"phase":   "fetching-source",
		"message": msg,
	})

	switch job.SourceType {
	case "artifact", "upload":
		if job.SourceArtifactKey == "" {
			return "", fmt.Errorf("missing uploaded backup artifact")
		}
		rc, err := storage.GetBackupArtifactStream(p.cfg, job.SourceArtifactKey)
		if err != nil {
			return "", err
		}
		defer rc.Close()
		f, err := os.Create(targetPath)
		if err != nil {
			return "", err
		}
		_, err = io.Copy(f, rc)
		f.Close()
		return targetPath, err
	case "remote":
		remoteURL, err := validateRemoteBackupURL(job.SourceRemoteURL)
		if err != nil {
			return "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, remoteURL, nil)
		if err != nil {
			return "", err
		}
		client := &http.Client{Timeout: 30 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return "", fmt.Errorf("failed to download remote backup (HTTP %d)", resp.StatusCode)
		}
		f, err := os.Create(targetPath)
		if err != nil {
			return "", err
		}
		_, err = io.Copy(f, resp.Body)
		f.Close()
		return targetPath, err
	default:
		return "", fmt.Errorf("unsupported restore source")
	}
}

func sanitizeUploadName(name string) string {
	if strings.TrimSpace(name) == "" {
		return "restore-source.zip"
	}
	return filepath.Base(name)
}

func validateRemoteBackupURL(value string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", fmt.Errorf("invalid remote URL")
	}
	if u.Scheme != "https" {
		return "", fmt.Errorf("remote backup URL must use HTTPS")
	}
	if u.User != nil {
		return "", fmt.Errorf("remote backup URL must not include credentials")
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return "", fmt.Errorf("remote backup URL host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateIP(ip) {
			return "", fmt.Errorf("remote backup URL host is not allowed")
		}
	} else {
		ips, err := net.LookupIP(host)
		if err != nil || len(ips) == 0 || isPrivateIP(ips[0]) {
			return "", fmt.Errorf("remote backup URL host is not allowed")
		}
	}
	return u.String(), nil
}

func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4[0] == 10 ||
			ip4[0] == 127 ||
			(ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31) ||
			(ip4[0] == 192 && ip4[1] == 168) ||
			(ip4[0] == 169 && ip4[1] == 254)
	}
	return ip.IsPrivate()
}

func (p *Processor) restoreCollectionFromEntry(ctx context.Context, collectionName string, entry *zip.File) error {
	rc, err := entry.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	if err = p.clearCollection(ctx, collectionName); err != nil {
		return err
	}

	scanner := bufio.NewScanner(rc)
	const maxLine = 16 * 1024 * 1024
	buf := make([]byte, 0, 1024*1024)
	scanner.Buffer(buf, maxLine)
	batch := make([]interface{}, 0, 100)

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		_, err := p.store.DB.Collection(collectionName).InsertMany(ctx, batch)
		batch = batch[:0]
		return err
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var doc bson.M
		if err := bson.UnmarshalExtJSON([]byte(line), false, &doc); err != nil {
			return err
		}
		if collectionName == collectionFormSubmissions {
			doc["payload"] = rewriteSubmissionPayload(p.cfg.Storage, doc["payload"])
		} else if collectionName == collectionMedia || collectionName == collectionUserDocuments {
			key := strings.TrimSpace(fmt.Sprint(doc["key"]))
			if key != "" {
				url, _ := storage.PublicURLForObjectKey(p.cfg.Storage, key)
				doc["url"] = url
			}
		}
		batch = append(batch, doc)
		if len(batch) >= 100 {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return flush()
}

func rewriteSubmissionPayload(storageCfg config.StorageConfig, payload any) any {
	m, ok := payload.(bson.M)
	if !ok {
		if d, ok2 := payload.(map[string]interface{}); ok2 {
			m = bson.M(d)
		} else {
			return payload
		}
	}
	out := bson.M{}
	for k, v := range m {
		upload, ok := v.(bson.M)
		if !ok {
			if d, ok2 := v.(map[string]interface{}); ok2 {
				upload = bson.M(d)
			} else {
				out[k] = v
				continue
			}
		}
		key := strings.TrimSpace(fmt.Sprint(upload["key"]))
		if key == "" {
			out[k] = v
			continue
		}
		url, _ := storage.PublicURLForObjectKey(storageCfg, key)
		upload["url"] = url
		out[k] = upload
	}
	return out
}

func (p *Processor) clearCollection(ctx context.Context, collectionName string) error {
	_, err := p.store.DB.Collection(collectionName).DeleteMany(ctx, bson.M{})
	return err
}

func (p *Processor) collectManagedKeys(ctx context.Context) (map[string]struct{}, error) {
	keys := map[string]struct{}{}
	mediaCursor, _ := p.store.DB.Collection("media").Find(ctx, bson.M{})
	for mediaCursor.Next(ctx) {
		var doc bson.M
		if mediaCursor.Decode(&doc) == nil {
			if key := strings.TrimSpace(fmt.Sprint(doc["key"])); key != "" {
				keys[key] = struct{}{}
			}
		}
	}
	mediaCursor.Close(ctx)

	subCursor, _ := p.store.DB.Collection("formsubmissions").Find(ctx, bson.M{})
	for subCursor.Next(ctx) {
		var doc bson.M
		if subCursor.Decode(&doc) == nil {
			for _, u := range extractFormUploads(doc["payload"]) {
				keys[u.Key] = struct{}{}
			}
		}
	}
	subCursor.Close(ctx)

	udCursor, _ := p.store.DB.Collection("userdocuments").Find(ctx, bson.M{})
	for udCursor.Next(ctx) {
		var doc bson.M
		if udCursor.Decode(&doc) == nil {
			if key := strings.TrimSpace(fmt.Sprint(doc["key"])); key != "" {
				keys[key] = struct{}{}
			}
		}
	}
	udCursor.Close(ctx)
	return keys, nil
}

func (p *Processor) restoreMediaEntries(ctx context.Context, jobID primitive.ObjectID, zr *zip.ReadCloser) (map[string]struct{}, error) {
	restored := map[string]struct{}{}
	var entries []*zip.File
	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, "media/") {
			entries = append(entries, f)
		}
	}
	p.store.UpdateProgress(ctx, jobID, bson.M{
		"phase":      "restoring-media",
		"message":    "Restoring media files",
		"mediaDone":  0,
		"mediaTotal": len(entries),
	})

	for i, entry := range entries {
		if err := p.store.ThrowIfCancelled(ctx, jobID); err != nil {
			return restored, err
		}
		key := strings.TrimPrefix(entry.Name, "media/")
		rc, err := entry.Open()
		if err != nil {
			return restored, err
		}
		err = storage.PutObjectStream(p.cfg.Storage, key, rc, storage.ContentTypeForKey(key))
		rc.Close()
		if err != nil {
			return restored, err
		}
		restored[key] = struct{}{}
		p.store.UpdateProgress(ctx, jobID, bson.M{
			"mediaDone": i + 1,
			"message":   "Restored " + key,
		})
	}
	return restored, nil
}

func (p *Processor) removeOldManagedKeys(current, restored map[string]struct{}) {
	for key := range current {
		if _, ok := restored[key]; ok {
			continue
		}
		_ = storage.DeleteObject(p.cfg.Storage, key)
	}
}

func containsString(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}
