package emailworker

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/mail"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Job struct {
	ID          primitive.ObjectID `bson:"_id"`
	Kind        string             `bson:"kind"`
	Status      string             `bson:"status"`
	To          string             `bson:"to"`
	Subject     string             `bson:"subject"`
	Text        string             `bson:"text"`
	HTML        string             `bson:"html"`
	ClientKey   string             `bson:"clientKey"`
	Attempts    int                `bson:"attempts"`
	MaxAttempts int                `bson:"maxAttempts"`
}

type Processor struct {
	DB     *mongo.Database
	Valkey *cache.Valkey
	Config config.WorkerConfig
}

func (p *Processor) FailStale(ctx context.Context) {
	cutoff := time.Now().Add(-30 * time.Minute)
	res, err := p.DB.Collection("emailjobs").UpdateMany(ctx, bson.M{
		"status":    "running",
		"startedAt": bson.M{"$lt": cutoff},
	}, bson.M{"$set": bson.M{
		"status":     "failed",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"error":      "Worker timed out",
	}})
	if err == nil && res.ModifiedCount > 0 {
		log.Printf("[email-worker] marked %d stale email job(s) as failed", res.ModifiedCount)
	}
}

func (p *Processor) ClaimNext(ctx context.Context, workerID string) (*Job, error) {
	now := time.Now()
	var job Job
	err := p.DB.Collection("emailjobs").FindOneAndUpdate(ctx,
		bson.M{"status": "queued"},
		bson.M{
			"$set": bson.M{
				"status":    "running",
				"startedAt": now,
				"lockedBy":  workerID,
				"error":     "",
			},
			"$inc": bson.M{"attempts": 1},
		},
		options.FindOneAndUpdate().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetReturnDocument(options.After),
	).Decode(&job)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (p *Processor) Process(ctx context.Context, job *Job) {
	id := job.ID.Hex()
	if !p.Config.CloudflareMail.Configured {
		p.markFailed(ctx, id, "Cloudflare mail is not configured", false)
		return
	}

	clientKey := job.ClientKey
	if allowed, reason := cache.AllowMailSend(ctx, p.Valkey, p.Config.MailRateLimit, clientKey); !allowed {
		p.markFailed(ctx, id, reason, true)
		return
	}

	result := mail.SendCloudflare(ctx, p.Config, mail.SendInput{
		To:      job.To,
		Subject: job.Subject,
		Text:    job.Text,
		HTML:    job.HTML,
	}, clientKey)

	mailMsgID := p.recordMailMessage(ctx, job, result)

	if !result.OK {
		p.markFailed(ctx, id, result.Error, true)
		return
	}
	_, _ = p.DB.Collection("emailjobs").UpdateByID(ctx, job.ID, bson.M{"$set": bson.M{
		"status":        "succeeded",
		"finishedAt":    time.Now(),
		"lockedBy":      "",
		"error":         "",
		"mailMessageId": mailMsgID,
	}})
}

func (p *Processor) recordMailMessage(ctx context.Context, job *Job, result mail.SendResult) string {
	status := "sent"
	errMsg := ""
	if !result.OK {
		status = "failed"
		errMsg = result.Error
	}
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	res, err := p.DB.Collection("mailmessages").InsertOne(ctx, bson.M{
		"to":               strings.TrimSpace(job.To),
		"from":             result.From,
		"subject":          strings.TrimSpace(job.Subject),
		"text":             job.Text,
		"html":             job.HTML,
		"status":           status,
		"kind":             job.Kind,
		"error":            errMsg,
		"formId":           nil,
		"formNameSnapshot": "",
		"submissionId":     nil,
		"createdAt":        time.Now(),
		"updatedAt":        time.Now(),
	})
	if err != nil {
		return ""
	}
	if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
		return oid.Hex()
	}
	return ""
}

func (p *Processor) markFailed(ctx context.Context, id, errMsg string, retry bool) {
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return
	}
	var job Job
	if err := p.DB.Collection("emailjobs").FindOne(ctx, bson.M{"_id": oid}).Decode(&job); err != nil {
		return
	}
	if retry && job.Attempts < job.MaxAttempts {
		_, _ = p.DB.Collection("emailjobs").UpdateByID(ctx, oid, bson.M{"$set": bson.M{
			"status":    "queued",
			"lockedBy":  "",
			"error":     errMsg,
			"startedAt": nil,
		}})
		return
	}
	_, _ = p.DB.Collection("emailjobs").UpdateByID(ctx, oid, bson.M{"$set": bson.M{
		"status":     "failed",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"error":      errMsg,
	}})
}
