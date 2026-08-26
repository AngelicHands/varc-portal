package importexportworker

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
	Trigger           string             `bson:"trigger"`
	RequestedByEmail  string             `bson:"requestedByEmail"`
	RequestedByUserID primitive.ObjectID `bson:"requestedByUserId"`
}

type JobStore struct {
	DB *mongo.Database
}

func (s *JobStore) FailStale(ctx context.Context, maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	res, _ := s.DB.Collection("importexportjobs").UpdateMany(ctx, bson.M{
		"status":    "running",
		"startedAt": bson.M{"$lt": cutoff},
	}, bson.M{"$set": bson.M{
		"status":     "failed",
		"finishedAt": time.Now(),
		"lockedBy":   "",
		"phase":      "failed",
		"message":    "Worker timed out",
		"error":      "Worker timed out",
	}})
	if res != nil && res.ModifiedCount > 0 {
		// logged by caller if needed
	}
}

func (s *JobStore) HasActive(ctx context.Context, kind string) bool {
	filter := bson.M{"status": bson.M{"$in": []string{"queued", "running"}}}
	if kind != "" {
		filter["kind"] = kind
	}
	err := s.DB.Collection("importexportjobs").FindOne(ctx, filter, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	return err == nil
}

func (s *JobStore) ClaimNext(ctx context.Context, workerID string) (*Job, error) {
	now := time.Now()
	var job Job
	err := s.DB.Collection("importexportjobs").FindOneAndUpdate(ctx,
		bson.M{"status": "queued"},
		bson.M{"$set": bson.M{
			"status":    "running",
			"startedAt": now,
			"lockedBy":  workerID,
			"phase":     "starting",
			"message":   "Worker claimed job",
			"error":     "",
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

func (s *JobStore) MarkFailed(ctx context.Context, id primitive.ObjectID, errMsg string) {
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	// Only mark running jobs so we do not overwrite a richer error already
	// written by the portal execute path.
	_, _ = s.DB.Collection("importexportjobs").UpdateOne(ctx,
		bson.M{"_id": id, "status": "running"},
		bson.M{"$set": bson.M{
			"status":     "failed",
			"finishedAt": time.Now(),
			"lockedBy":   "",
			"phase":      "failed",
			"message":    "Job failed",
			"error":      errMsg,
		}},
	)
}

func (s *JobStore) CreateScheduled(ctx context.Context, kind, email string) (primitive.ObjectID, error) {
	now := time.Now()
	res, err := s.DB.Collection("importexportjobs").InsertOne(ctx, bson.M{
		"kind":              kind,
		"status":            "queued",
		"trigger":           "scheduled",
		"requestedByUserId": nil,
		"requestedByEmail":  email,
		"requestedByName":   "Scheduler",
		"phase":             "queued",
		"message":           "Scheduled run",
		"lockedBy":          "",
		"startedAt":         nil,
		"finishedAt":        nil,
		"error":             "",
		"commitSha":         "",
		"htmlUrl":           "",
		"stats":             nil,
		"createdAt":         now,
		"updatedAt":         now,
	})
	if err != nil {
		return primitive.NilObjectID, err
	}
	oid, ok := res.InsertedID.(primitive.ObjectID)
	if !ok {
		return primitive.NilObjectID, nil
	}
	return oid, nil
}
