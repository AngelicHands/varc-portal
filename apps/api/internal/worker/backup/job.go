package backup

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Job struct {
	ID                primitive.ObjectID `bson:"_id"`
	Kind              string             `bson:"kind"`
	Status            string             `bson:"status"`
	RequestedByEmail  string             `bson:"requestedByEmail"`
	SourceType        string             `bson:"sourceType"`
	SourceArtifactKey string             `bson:"sourceArtifactKey"`
	SourceRemoteURL   string             `bson:"sourceRemoteUrl"`
	SourceFileName    string             `bson:"sourceFileName"`
}

type JobStore struct {
	DB *mongo.Database
}

func (s *JobStore) FailStale(ctx context.Context, maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	_, _ = s.DB.Collection("backupjobs").UpdateMany(ctx, bson.M{
		"status":    "running",
		"updatedAt": bson.M{"$lt": cutoff},
	}, bson.M{"$set": bson.M{
		"status":     "failed",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"phase":      "failed",
		"message":    "Worker timed out",
		"error":      "Worker timed out",
	}})
}

func (s *JobStore) ClaimNext(ctx context.Context, workerID string) (*Job, error) {
	now := time.Now()
	var job Job
	err := s.DB.Collection("backupjobs").FindOneAndUpdate(ctx,
		bson.M{"status": "queued"},
		bson.M{"$set": bson.M{
			"status":    "running",
			"startedAt": now,
			"lockedBy":  workerID,
			"phase":     "starting",
			"message":   "Worker claimed job",
		}},
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

func (s *JobStore) IsCancelled(ctx context.Context, id primitive.ObjectID) bool {
	var doc struct {
		Status string `bson:"status"`
	}
	err := s.DB.Collection("backupjobs").FindOne(ctx, bson.M{"_id": id}, options.FindOne().SetProjection(bson.M{"status": 1})).Decode(&doc)
	return err == nil && doc.Status == "cancelled"
}

func (s *JobStore) UpdateProgress(ctx context.Context, id primitive.ObjectID, patch bson.M) {
	if len(patch) == 0 {
		return
	}
	patch["updatedAt"] = time.Now()
	_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, id, bson.M{"$set": patch})
}

func (s *JobStore) MarkSucceeded(ctx context.Context, id primitive.ObjectID, patch bson.M) {
	set := bson.M{
		"status":     "succeeded",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"phase":      "done",
		"error":      "",
		"updatedAt":  time.Now(),
	}
	for k, v := range patch {
		set[k] = v
	}
	if _, ok := set["message"]; !ok {
		set["message"] = "Completed"
	}
	_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, id, bson.M{"$set": set})
}

func (s *JobStore) MarkFailed(ctx context.Context, id primitive.ObjectID, errMsg string) {
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, id, bson.M{"$set": bson.M{
		"status":     "failed",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"phase":      "failed",
		"message":    "Job failed",
		"error":      errMsg,
		"updatedAt":  time.Now(),
	}})
}

func (s *JobStore) MarkEmailSent(ctx context.Context, id primitive.ObjectID) {
	_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, id, bson.M{"$set": bson.M{
		"emailSentAt": time.Now(),
		"updatedAt":   time.Now(),
	}})
}

func (s *JobStore) CleanupArtifacts(ctx context.Context, maxAgeDays, maxCount int) {
	cutoff := time.Now().Add(-time.Duration(maxAgeDays) * 24 * time.Hour)
	oldCursor, err := s.DB.Collection("backupjobs").Find(ctx, bson.M{
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
			// artifact deletion handled by processor with storage package
			_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, doc.ID, bson.M{"$set": bson.M{
				"artifactKey":       "",
				"sourceArtifactKey": "",
			}})
		}
	}

	succeeded, err := s.DB.Collection("backupjobs").Find(ctx, bson.M{
		"kind":        "backup",
		"status":      "succeeded",
		"artifactKey": bson.M{"$ne": ""},
	}, options.Find().SetSort(bson.D{{Key: "finishedAt", Value: -1}, {Key: "createdAt", Value: -1}}))
	if err != nil {
		return
	}
	defer succeeded.Close(ctx)
	var docs []struct {
		ID          primitive.ObjectID `bson:"_id"`
		ArtifactKey string             `bson:"artifactKey"`
	}
	for succeeded.Next(ctx) {
		var doc struct {
			ID          primitive.ObjectID `bson:"_id"`
			ArtifactKey string             `bson:"artifactKey"`
		}
		if succeeded.Decode(&doc) != nil {
			continue
		}
		docs = append(docs, doc)
	}
	if len(docs) <= maxCount {
		return
	}
	for _, doc := range docs[maxCount:] {
		_, _ = s.DB.Collection("backupjobs").UpdateByID(ctx, doc.ID, bson.M{"$set": bson.M{"artifactKey": ""}})
	}
}

type cancelledError struct{}

func (cancelledError) Error() string { return "Backup job cancelled" }

func (s *JobStore) ThrowIfCancelled(ctx context.Context, id primitive.ObjectID) error {
	if s.IsCancelled(ctx, id) {
		return cancelledError{}
	}
	return nil
}
