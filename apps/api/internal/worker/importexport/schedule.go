package importexportworker

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const settingsKey = "default"

type scheduleDirection struct {
	enabled         bool
	intervalMinutes int
	nextRunAt       time.Time
	verifyStatus    string
	source          string
	repoURL         string
	hasPat          bool
}

type Processor struct {
	store  *JobStore
	cfg    portalConfig
	worker portalExecutor
}

type portalConfig struct {
	internalURL string
	secret      string
}

type portalExecutor interface {
	RunJob(ctx context.Context, jobID string) error
}

func NewProcessor(store *JobStore, internalURL, secret string) *Processor {
	return &Processor{
		store: store,
		cfg: portalConfig{internalURL: strings.TrimSuffix(internalURL, "/"), secret: secret},
		worker: &httpExecutor{
			baseURL: strings.TrimSuffix(internalURL, "/"),
			secret:  secret,
		},
	}
}

func (p *Processor) ProcessDueSchedules(ctx context.Context) {
	if p.cfg.secret == "" || p.cfg.internalURL == "" {
		return
	}

	var doc bson.M
	err := p.store.DB.Collection("importexportsettings").FindOne(ctx, bson.M{"key": settingsKey}).Decode(&doc)
	if err != nil {
		return
	}

	now := time.Now()
	for _, item := range []struct {
		kind string
		dir  scheduleDirection
	}{
		{"import", readImportSchedule(doc)},
		{"export", readExportSchedule(doc)},
	} {
		if !item.dir.ready() {
			continue
		}
		if !item.dir.nextRunAt.IsZero() && item.dir.nextRunAt.After(now) {
			continue
		}
		if p.store.HasActive(ctx, item.kind) {
			continue
		}

		email := "scheduler@varc-portal"
		jobID, err := p.store.CreateScheduled(ctx, item.kind, email)
		if err != nil {
			log.Printf("[import-export-worker] schedule enqueue %s: %v", item.kind, err)
			continue
		}

		next := now.Add(time.Duration(item.dir.intervalMinutes) * time.Minute)
		p.updateScheduleAfterRun(ctx, item.kind, now, next)
		log.Printf("[import-export-worker] scheduled %s job %s", item.kind, jobID.Hex())
	}
}

func readImportSchedule(doc bson.M) scheduleDirection {
	return scheduleDirection{
		enabled:         boolField(doc, "importScheduleEnabled"),
		intervalMinutes: intField(doc, "importScheduleIntervalMinutes", 60),
		nextRunAt:       timeField(doc, "importScheduleNextRunAt"),
		verifyStatus:    stringField(doc, "importVerifyStatus"),
		source:          stringField(doc, "importSource"),
		repoURL:         stringField(doc, "importGithubRepoUrl"),
		hasPat:          strings.TrimSpace(stringField(doc, "importGithubPat")) != "",
	}
}

func readExportSchedule(doc bson.M) scheduleDirection {
	return scheduleDirection{
		enabled:         boolField(doc, "exportScheduleEnabled"),
		intervalMinutes: intField(doc, "exportScheduleIntervalMinutes", 60),
		nextRunAt:       timeField(doc, "exportScheduleNextRunAt"),
		verifyStatus:    stringField(doc, "exportVerifyStatus"),
		source:          stringField(doc, "exportSource"),
		repoURL:         stringField(doc, "exportGithubRepoUrl"),
		hasPat:          strings.TrimSpace(stringField(doc, "exportGithubPat")) != "",
	}
}

func (d scheduleDirection) ready() bool {
	if !d.enabled || d.intervalMinutes < 1 {
		return false
	}
	if d.verifyStatus != "verified" {
		return false
	}
	if d.source != "github" || strings.TrimSpace(d.repoURL) == "" || !d.hasPat {
		return false
	}
	return true
}

func (p *Processor) updateScheduleAfterRun(ctx context.Context, kind string, lastRun, nextRun time.Time) {
	prefix := "import"
	if kind == "export" {
		prefix = "export"
	}
	_, _ = p.store.DB.Collection("importexportsettings").UpdateOne(ctx,
		bson.M{"key": settingsKey},
		bson.M{"$set": bson.M{
			prefix + "ScheduleLastRunAt": lastRun,
			prefix + "ScheduleNextRunAt": nextRun,
			"updatedAt":                 time.Now(),
		}},
		options.Update().SetUpsert(false),
	)
}

func (p *Processor) Process(ctx context.Context, job *Job) {
	if p.cfg.secret == "" || p.cfg.internalURL == "" {
		p.store.MarkFailed(ctx, job.ID, "Portal worker integration is not configured")
		return
	}
	if err := p.worker.RunJob(ctx, job.ID.Hex()); err != nil {
		p.store.MarkFailed(ctx, job.ID, err.Error())
		log.Printf("[import-export-worker] job %s failed: %v", job.ID.Hex(), err)
		return
	}
	log.Printf("[import-export-worker] job %s succeeded", job.ID.Hex())
}

func boolField(doc bson.M, key string) bool {
	switch v := doc[key].(type) {
	case bool:
		return v
	default:
		return false
	}
}

func intField(doc bson.M, key string, fallback int) int {
	switch v := doc[key].(type) {
	case int32:
		if v > 0 {
			return int(v)
		}
	case int64:
		if v > 0 {
			return int(v)
		}
	case float64:
		if v > 0 {
			return int(v)
		}
	case int:
		if v > 0 {
			return v
		}
	}
	if fallback > 0 {
		return fallback
	}
	return 60
}

func stringField(doc bson.M, key string) string {
	if v, ok := doc[key]; ok {
		return strings.TrimSpace(toString(v))
	}
	return ""
}

func timeField(doc bson.M, key string) time.Time {
	switch v := doc[key].(type) {
	case time.Time:
		return v
	case primitive.DateTime:
		return v.Time()
	default:
		return time.Time{}
	}
}

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(v)
	}
}
