package backup

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/storage"
	"go.mongodb.org/mongo-driver/bson"
)

type Manifest struct {
	FormatVersion            int      `json:"formatVersion"`
	AppVersion               string   `json:"appVersion"`
	CreatedAt                string   `json:"createdAt"`
	CreatedByEmail           string   `json:"createdByEmail"`
	CollectionNames          []string `json:"collectionNames"`
	MediaCount               int      `json:"mediaCount"`
	MediaBytes               int64    `json:"mediaBytes"`
	MissingMedia             []string `json:"missingMedia"`
	StorageDriver            string   `json:"storageDriver"`
	SourcePublicMediaBaseURL string   `json:"sourcePublicMediaBaseUrl"`
}

type mediaEntry struct {
	Key         string
	ContentType string
	Size        int64
}

func buildBackupFileName(now time.Time) string {
	stamp := now.UTC().Format("20060102-150405")
	return "varc-backup-" + stamp + ".zip"
}

func (p *Processor) buildBackupArchive(ctx context.Context, job *Job) (filePath, fileName string, manifest Manifest, err error) {
	tempDir, err := os.MkdirTemp("", "varc-backup-")
	if err != nil {
		return "", "", Manifest{}, err
	}
	defer func() {
		if err != nil {
			_ = os.RemoveAll(tempDir)
		}
	}()

	jsonDir := filepath.Join(tempDir, "mongo")
	if err = os.MkdirAll(jsonDir, 0o755); err != nil {
		return "", "", Manifest{}, err
	}
	fileName = buildBackupFileName(time.Now())
	filePath = filepath.Join(tempDir, fileName)

	if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
		return "", "", Manifest{}, err
	}
	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"phase":             "collecting",
		"message":           "Collecting media references",
		"collectionsDone":   0,
		"collectionsTotal":  len(BackupCollectionNames),
	})

	mediaEntries, err := p.collectMediaEntries(ctx)
	if err != nil {
		return "", "", Manifest{}, err
	}
	var bytesTotal int64
	for _, m := range mediaEntries {
		bytesTotal += m.Size
	}
	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"mediaDone":   0,
		"mediaTotal":  len(mediaEntries),
		"bytesTotal":  bytesTotal,
	})

	collectionsDone := 0
	for _, name := range BackupCollectionNames {
		if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
			return "", "", Manifest{}, err
		}
		p.store.UpdateProgress(ctx, job.ID, bson.M{
			"phase":            "dumping-mongo",
			"message":          "Exporting " + name,
			"collectionsDone":  collectionsDone,
		})
		outPath := filepath.Join(jsonDir, name+".jsonl")
		if err = p.writeCollectionJSONL(ctx, name, outPath); err != nil {
			return "", "", Manifest{}, err
		}
		collectionsDone++
		p.store.UpdateProgress(ctx, job.ID, bson.M{"collectionsDone": collectionsDone})
	}

	p.store.UpdateProgress(ctx, job.ID, bson.M{
		"phase":            "archiving",
		"message":          "Compressing backup archive",
		"collectionsDone":  collectionsDone,
		"mediaDone":        0,
	})

	missingMedia := []string{}
	zipFile, err := os.Create(filePath)
	if err != nil {
		return "", "", Manifest{}, err
	}
	zw := zip.NewWriter(zipFile)
	for _, name := range BackupCollectionNames {
		src := filepath.Join(jsonDir, name+".jsonl")
		if err = addFileToZip(zw, src, "mongo/"+name+".jsonl"); err != nil {
			zw.Close()
			zipFile.Close()
			return "", "", Manifest{}, err
		}
	}

	mediaDone := 0
	bytesDone := int64(0)
	for _, media := range mediaEntries {
		if err = p.store.ThrowIfCancelled(ctx, job.ID); err != nil {
			zw.Close()
			zipFile.Close()
			return "", "", Manifest{}, err
		}
		reader, err := storage.GetObjectStream(p.cfg.Storage, media.Key)
		if err != nil {
			missingMedia = append(missingMedia, media.Key)
			continue
		}
		w, err := zw.Create("media/" + media.Key)
		if err != nil {
			reader.Body.Close()
			zw.Close()
			zipFile.Close()
			return "", "", Manifest{}, err
		}
		_, copyErr := io.Copy(w, reader.Body)
		reader.Body.Close()
		if copyErr != nil {
			missingMedia = append(missingMedia, media.Key)
			continue
		}
		mediaDone++
		bytesDone += media.Size
		p.store.UpdateProgress(ctx, job.ID, bson.M{
			"mediaDone": mediaDone,
			"bytesDone": bytesDone,
			"message":   "Archived " + media.Key,
		})
	}

	manifest = p.createManifest(job.RequestedByEmail, mediaEntries, missingMedia)
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
	mw, err := zw.Create("manifest.json")
	if err != nil {
		zw.Close()
		zipFile.Close()
		return "", "", Manifest{}, err
	}
	if _, err = mw.Write(manifestBytes); err != nil {
		zw.Close()
		zipFile.Close()
		return "", "", Manifest{}, err
	}
	if err = zw.Close(); err != nil {
		zipFile.Close()
		return "", "", Manifest{}, err
	}
	if err = zipFile.Close(); err != nil {
		return "", "", Manifest{}, err
	}
	return filePath, fileName, manifest, nil
}

func addFileToZip(zw *zip.Writer, srcPath, destPath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()
	w, err := zw.Create(destPath)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}

func (p *Processor) createManifest(email string, media []mediaEntry, missing []string) Manifest {
	var mediaBytes int64
	for _, m := range media {
		mediaBytes += m.Size
	}
	driver := p.cfg.Storage.Driver
	if driver == "" {
		driver = "local"
	}
	return Manifest{
		FormatVersion:            1,
		AppVersion:               p.cfg.AppVersion,
		CreatedAt:                time.Now().UTC().Format(time.RFC3339),
		CreatedByEmail:           email,
		CollectionNames:          append([]string{}, BackupCollectionNames...),
		MediaCount:               len(media),
		MediaBytes:               mediaBytes,
		MissingMedia:             append([]string{}, missing...),
		StorageDriver:            driver,
		SourcePublicMediaBaseURL: storage.SourcePublicMediaBaseURL(p.cfg.Storage),
	}
}

func (p *Processor) writeCollectionJSONL(ctx context.Context, collectionName, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return err
	}
	f, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer f.Close()
	writer := bufio.NewWriter(f)
	cursor, err := p.store.DB.Collection(collectionName).Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return err
		}
		line, err := bson.MarshalExtJSON(doc, false, false)
		if err != nil {
			return err
		}
		if _, err = writer.Write(line); err != nil {
			return err
		}
		if _, err = writer.WriteString("\n"); err != nil {
			return err
		}
	}
	writer.Flush()
	return cursor.Err()
}

func (p *Processor) collectMediaEntries(ctx context.Context) ([]mediaEntry, error) {
	byKey := map[string]mediaEntry{}

	mediaCursor, err := p.store.DB.Collection("media").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	for mediaCursor.Next(ctx) {
		var doc bson.M
		if mediaCursor.Decode(&doc) != nil {
			continue
		}
		key := strings.TrimSpace(fmt.Sprint(doc["key"]))
		if key == "" {
			continue
		}
		byKey[key] = mediaEntry{
			Key:         key,
			ContentType: stringField(doc, "contentType", storage.ContentTypeForKey(key)),
			Size:        int64Field(doc, "size"),
		}
	}
	mediaCursor.Close(ctx)

	subCursor, _ := p.store.DB.Collection("formsubmissions").Find(ctx, bson.M{})
	for subCursor.Next(ctx) {
		var doc bson.M
		if subCursor.Decode(&doc) != nil {
			continue
		}
		for _, upload := range extractFormUploads(doc["payload"]) {
			if _, ok := byKey[upload.Key]; !ok {
				byKey[upload.Key] = upload
			}
		}
	}
	subCursor.Close(ctx)

	udCursor, _ := p.store.DB.Collection("userdocuments").Find(ctx, bson.M{})
	for udCursor.Next(ctx) {
		var doc bson.M
		if udCursor.Decode(&doc) != nil {
			continue
		}
		key := strings.TrimSpace(fmt.Sprint(doc["key"]))
		if key == "" {
			continue
		}
		if _, ok := byKey[key]; !ok {
			byKey[key] = mediaEntry{
				Key:         key,
				ContentType: stringField(doc, "contentType", storage.ContentTypeForKey(key)),
				Size:        int64Field(doc, "size"),
			}
		}
	}
	udCursor.Close(ctx)

	out := make([]mediaEntry, 0, len(byKey))
	for _, entry := range byKey {
		out = append(out, entry)
	}
	// sort by key
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Key < out[i].Key {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

func extractFormUploads(payload any) []mediaEntry {
	m, ok := payload.(bson.M)
	if !ok {
		if d, ok2 := payload.(map[string]interface{}); ok2 {
			m = bson.M(d)
		} else {
			return nil
		}
	}
	var out []mediaEntry
	for _, value := range m {
		upload, ok := value.(bson.M)
		if !ok {
			if d, ok2 := value.(map[string]interface{}); ok2 {
				upload = bson.M(d)
			} else {
				continue
			}
		}
		key := strings.TrimSpace(fmt.Sprint(upload["key"]))
		if key == "" {
			continue
		}
		size := int64Field(upload, "size")
		if size <= 0 {
			continue
		}
		ct := stringField(upload, "contentType", storage.ContentTypeForKey(key))
		if ct == "" {
			continue
		}
		out = append(out, mediaEntry{Key: key, ContentType: ct, Size: size})
	}
	return out
}

func stringField(doc bson.M, key, fallback string) string {
	if v, ok := doc[key]; ok {
		s := strings.TrimSpace(fmt.Sprint(v))
		if s != "" && s != "<nil>" {
			return s
		}
	}
	return fallback
}

func int64Field(doc bson.M, key string) int64 {
	switch v := doc[key].(type) {
	case int32:
		return int64(v)
	case int64:
		return v
	case float64:
		return int64(v)
	case int:
		return int64(v)
	default:
		return 0
	}
}
