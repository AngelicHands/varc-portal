package qso

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var ErrNotFound = errors.New("not found")
var ErrNoCallsign = errors.New("no callsign")

type Service struct {
	store *appmongo.Store
}

func NewService(store *appmongo.Store) *Service {
	return &Service{store: store}
}

func (s *Service) RequireUserCallsign(ctx context.Context, userID string) (string, error) {
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return "", ErrNoCallsign
	}
	callsign, err := s.store.UserCallsign(ctx, oid)
	if err != nil {
		return "", err
	}
	callsign = strings.TrimSpace(callsign)
	if callsign == "" {
		return "", ErrNoCallsign
	}
	return callsign, nil
}

func (s *Service) Create(ctx context.Context, userID string, input Input) (ListItem, error) {
	if _, err := s.RequireUserCallsign(ctx, userID); err != nil {
		return ListItem{}, err
	}
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return ListItem{}, ErrNotFound
	}
	qsoAt, _ := time.Parse(time.RFC3339, input.QsoAt)
	now := time.Now().UTC()
	doc := appmongo.QsoLog{
		UserID:         userOID,
		WorkedCallsign: input.WorkedCallsign,
		QsoAt:          qsoAt.UTC(),
		Band:           input.Band,
		FreqMhz:        &input.FreqMhz,
		Mode:           input.Mode,
		RstSent:        input.RstSent,
		RstRcvd:        input.RstRcvd,
		QsoSent:        input.QsoSent,
		QsoConfirmed:   false,
		Source:         "api",
		Grid:           input.Grid,
		Notes:          input.Notes,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	result, err := s.store.Qsos().InsertOne(ctx, doc)
	if err != nil {
		return ListItem{}, err
	}
	doc.ID = result.InsertedID.(primitive.ObjectID)
	return ToListItem(doc), nil
}

func (s *Service) Get(ctx context.Context, userID, id string) (ListItem, error) {
	doc, err := s.findOwned(ctx, userID, id)
	if err != nil {
		return ListItem{}, err
	}
	return ToListItem(*doc), nil
}

func (s *Service) Update(ctx context.Context, userID, id string, input Input) (ListItem, error) {
	doc, err := s.findOwned(ctx, userID, id)
	if err != nil {
		return ListItem{}, err
	}
	qsoAt, _ := time.Parse(time.RFC3339, input.QsoAt)
	update := bson.M{
		"$set": bson.M{
			"workedCallsign": input.WorkedCallsign,
			"qsoAt":          qsoAt.UTC(),
			"band":           input.Band,
			"freqMhz":        input.FreqMhz,
			"mode":           input.Mode,
			"rstSent":        input.RstSent,
			"rstRcvd":        input.RstRcvd,
			"qso_sent":       input.QsoSent,
			"grid":           input.Grid,
			"notes":          input.Notes,
			"updatedAt":      time.Now().UTC(),
		},
	}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated appmongo.QsoLog
	err = s.store.Qsos().FindOneAndUpdate(ctx, bson.M{"_id": doc.ID}, update, opts).Decode(&updated)
	if err != nil {
		return ListItem{}, err
	}
	return ToListItem(updated), nil
}

func (s *Service) Delete(ctx context.Context, userID, id string) error {
	doc, err := s.findOwned(ctx, userID, id)
	if err != nil {
		return err
	}
	_, err = s.store.Qsos().DeleteOne(ctx, bson.M{"_id": doc.ID})
	return err
}

func (s *Service) List(ctx context.Context, userID string, params ListParams) (PageResult, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return PageResult{}, ErrNotFound
	}
	filter := buildListFilter(userOID, params.Filters)
	total, err := s.store.Qsos().CountDocuments(ctx, filter)
	if err != nil {
		return PageResult{}, err
	}
	totalPages := 0
	page := params.Page
	if total > 0 {
		totalPages = int((total + int64(params.PageSize) - 1) / int64(params.PageSize))
		if page > totalPages {
			page = totalPages
		}
		if page < 1 {
			page = 1
		}
	} else {
		page = 1
	}

	findOpts := options.Find().
		SetSort(mongoSort(params.SortKey, params.SortDir)).
		SetSkip(int64((page - 1) * params.PageSize)).
		SetLimit(int64(params.PageSize))

	cursor, err := s.store.Qsos().Find(ctx, filter, findOpts)
	if err != nil {
		return PageResult{}, err
	}
	defer cursor.Close(ctx)

	items := make([]ListItem, 0)
	for cursor.Next(ctx) {
		var doc appmongo.QsoLog
		if err := cursor.Decode(&doc); err != nil {
			return PageResult{}, err
		}
		items = append(items, ToListItem(doc))
	}
	if err := cursor.Err(); err != nil {
		return PageResult{}, err
	}

	if items == nil {
		items = []ListItem{}
	}

	return PageResult{
		OK:    true,
		Items: items,
		Pagination: Pagination{
			Page:       page,
			PageSize:   params.PageSize,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    totalPages > 0 && page < totalPages,
			HasPrev:    page > 1 && totalPages > 0,
		},
		Filters: params.Filters.Applied(),
		SortKey: params.SortKey,
		SortDir: params.SortDir,
	}, nil
}

func (s *Service) findOwned(ctx context.Context, userID, id string) (*appmongo.QsoLog, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrNotFound
	}
	qsoOID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrNotFound
	}
	var doc appmongo.QsoLog
	err = s.store.Qsos().FindOne(ctx, bson.M{"_id": qsoOID, "userId": userOID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func buildListFilter(userID primitive.ObjectID, filters ListFilters) bson.M {
	clauses := []bson.M{{"userId": userID}}

	search := strings.TrimSpace(filters.Search)
	if search != "" {
		pattern := EscapeRegex(search)
		regex := primitive.Regex{Pattern: pattern, Options: "i"}
		clauses = append(clauses, bson.M{
			"$or": []bson.M{
				{"workedCallsign": regex},
				{"mode": regex},
				{"band": regex},
				{"grid": regex},
				{"notes": regex},
			},
		})
	}

	if filters.FromDate != nil {
		clauses = append(clauses, bson.M{"qsoAt": bson.M{"$gte": *filters.FromDate}})
	}
	if filters.ToDate != nil {
		clauses = append(clauses, bson.M{"qsoAt": bson.M{"$lte": *filters.ToDate}})
	}
	if filters.Band != "" {
		clauses = append(clauses, bson.M{"band": filters.Band})
	}
	if filters.Mode != "" {
		clauses = append(clauses, bson.M{"mode": primitive.Regex{
			Pattern: "^" + EscapeRegex(filters.Mode) + "$",
			Options: "i",
		}})
	}
	if filters.WorkedCallsign != "" {
		clauses = append(clauses, bson.M{"workedCallsign": filters.WorkedCallsign})
	}
	if filters.Source != "" {
		clauses = append(clauses, bson.M{"source": filters.Source})
	}
	if filters.Grid != "" {
		clauses = append(clauses, bson.M{"grid": filters.Grid})
	}
	if filters.QsoSent != nil {
		clauses = append(clauses, bson.M{"qso_sent": *filters.QsoSent})
	}
	if filters.QsoConfirmed != nil {
		clauses = append(clauses, bson.M{"qso_confirmed": *filters.QsoConfirmed})
	}

	if len(clauses) == 1 {
		return clauses[0]
	}
	return bson.M{"$and": clauses}
}

func mongoSort(sortKey, sortDir string) bson.D {
	dir := -1
	if sortDir == "asc" {
		dir = 1
	}
	if sortKey == "qsoAt" {
		return bson.D{{Key: "qsoAt", Value: dir}, {Key: "_id", Value: dir}}
	}
	return bson.D{{Key: sortKey, Value: dir}, {Key: "qsoAt", Value: -1}, {Key: "_id", Value: -1}}
}

func PageQueryHash(search string, page, pageSize int, sortKey, sortDir string) string {
	payload, _ := json.Marshal(map[string]any{
		"search": search, "page": page, "pageSize": pageSize,
		"sortKey": sortKey, "sortDir": sortDir,
	})
	sum := sha1.Sum(payload)
	return hex.EncodeToString(sum[:])[:16]
}
