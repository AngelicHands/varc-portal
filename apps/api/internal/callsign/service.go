package callsign

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

var ErrNotFound = errors.New("callsign not found")

type ValidationError struct {
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}

type Service struct {
	store *appmongo.Store
}

func NewService(store *appmongo.Store) *Service {
	return &Service{store: store}
}

type ListParams struct {
	Query    string
	Page     int
	PageSize int
}

func ParseListQuery(values url.Values) (ListParams, error) {
	allowed := map[string]struct{}{
		"q": {}, "page": {}, "pageSize": {},
	}
	seen := map[string]struct{}{}
	for key := range values {
		if _, ok := allowed[key]; !ok {
			return ListParams{}, ValidationError{Message: fmt.Sprintf("Unknown query parameter: %s", key)}
		}
		if _, dup := seen[key]; dup {
			return ListParams{}, ValidationError{Message: fmt.Sprintf("Duplicate query parameter: %s", key)}
		}
		seen[key] = struct{}{}
		if len(values[key]) != 1 {
			return ListParams{}, ValidationError{Message: fmt.Sprintf("Duplicate query parameter: %s", key)}
		}
	}

	query := normalizeSearchQuery(values.Get("q"))

	page := 1
	if raw := values.Get("page"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return ListParams{}, ValidationError{Message: "page must be a positive integer"}
		}
		page = n
	}

	pageSize := DefaultPageSize
	if raw := values.Get("pageSize"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > MaxPageSize {
			return ListParams{}, ValidationError{Message: fmt.Sprintf("pageSize must be between 1 and %d", MaxPageSize)}
		}
		pageSize = n
	}

	return ListParams{Query: query, Page: page, PageSize: pageSize}, nil
}

func buildFilter(query string) bson.M {
	if query == "" {
		return bson.M{"_id": bson.M{"$exists": false}}
	}

	signQ := normalizeCallsignQuery(query)
	folded := foldSearchText(query)
	permitQ := normalizePermitQuery(query)
	clauses := make([]bson.M, 0, 3)

	if len(signQ) >= 2 {
		clauses = append(clauses, bson.M{"sign": bson.M{"$regex": "^" + escapeRegex(signQ)}})
	}
	if len(folded) >= 2 {
		clauses = append(clauses, bson.M{"searchNames": bson.M{"$regex": escapeRegex(folded)}})
	}
	if len(permitQ) >= 3 {
		clauses = append(clauses, bson.M{"searchPermits": permitQ})
	}

	if len(clauses) == 0 {
		if signQ != "" {
			return bson.M{"sign": bson.M{"$regex": "^" + escapeRegex(signQ)}}
		}
		return bson.M{"_id": bson.M{"$exists": false}}
	}
	return bson.M{"$or": clauses}
}

func (s *Service) Search(ctx context.Context, params ListParams) (SearchResult, error) {
	empty := SearchResult{
		OK:    true,
		Query: params.Query,
		Items: []ListItem{},
		Pagination: Pagination{
			Page:       1,
			PageSize:   params.PageSize,
			Total:      0,
			TotalPages: 0,
			HasNext:    false,
			HasPrev:    false,
		},
	}
	if params.Query == "" {
		return empty, nil
	}

	filter := buildFilter(params.Query)
	total, err := s.store.Callsigns().CountDocuments(ctx, filter)
	if err != nil {
		return SearchResult{}, err
	}

	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(params.PageSize) - 1) / int64(params.PageSize))
	}
	page := params.Page
	if totalPages > 0 && page > totalPages {
		page = totalPages
	}
	if page < 1 {
		page = 1
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "sign", Value: 1}}).
		SetSkip(int64((page - 1) * params.PageSize)).
		SetLimit(int64(params.PageSize))

	cursor, err := s.store.Callsigns().Find(ctx, filter, opts)
	if err != nil {
		return SearchResult{}, err
	}
	defer cursor.Close(ctx)

	var docs []appmongo.Callsign
	if err := cursor.All(ctx, &docs); err != nil {
		return SearchResult{}, err
	}

	items := make([]ListItem, 0, len(docs))
	for _, doc := range docs {
		items = append(items, toListItem(doc))
	}

	return SearchResult{
		OK:    true,
		Query: params.Query,
		Items: items,
		Pagination: Pagination{
			Page:       page,
			PageSize:   params.PageSize,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    totalPages > 0 && page < totalPages,
			HasPrev:    page > 1,
		},
	}, nil
}

func (s *Service) GetBySign(ctx context.Context, rawSign string) (DetailResult, error) {
	sign := normalizeCallsignQuery(rawSign)
	if sign == "" {
		return DetailResult{}, ErrNotFound
	}

	var doc appmongo.Callsign
	err := s.store.Callsigns().FindOne(ctx, bson.M{"sign": sign}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return DetailResult{}, ErrNotFound
	}
	if err != nil {
		return DetailResult{}, err
	}

	opts := options.Find().SetSort(bson.D{
		{Key: "issuedAt", Value: -1},
		{Key: "stt", Value: -1},
	})
	cursor, err := s.store.CallsignLicenses().Find(ctx, bson.M{"callsigns": sign}, opts)
	if err != nil {
		return DetailResult{}, err
	}
	defer cursor.Close(ctx)

	var licenses []appmongo.CallsignLicense
	if err := cursor.All(ctx, &licenses); err != nil {
		return DetailResult{}, err
	}

	items := make([]LicenseItem, 0, len(licenses))
	for _, row := range licenses {
		items = append(items, toLicenseItem(row))
	}

	var area *string
	if doc.AreaDigit != nil && *doc.AreaDigit != "" {
		area = doc.AreaDigit
	}
	status := doc.LatestStatus
	if status == "" {
		status = "unknown"
	}

	return DetailResult{
		OK: true,
		Callsign: Detail{
			Sign:         doc.Sign,
			PrefixFamily: doc.PrefixFamily,
			AreaDigit:    area,
			OperatorName: doc.LatestOperatorName,
			EventCount:   doc.EventCount,
			LatestStatus: status,
			Licenses:     items,
		},
	}, nil
}

func (s *Service) Stats(ctx context.Context) (StatsResult, error) {
	callsigns, err := s.store.Callsigns().CountDocuments(ctx, bson.M{})
	if err != nil {
		return StatsResult{}, err
	}
	events, err := s.store.CallsignLicenses().CountDocuments(ctx, bson.M{})
	if err != nil {
		return StatsResult{}, err
	}
	expired, err := s.store.Callsigns().CountDocuments(ctx, bson.M{"latestStatus": "expired"})
	if err != nil {
		return StatsResult{}, err
	}

	values, err := s.store.Callsigns().Distinct(ctx, "operatorIds", bson.M{})
	if err != nil {
		return StatsResult{}, err
	}

	return StatsResult{
		OK: true,
		Stats: Stats{
			Callsigns: callsigns,
			Operators: len(values),
			Events:    events,
			Expired:   expired,
		},
	}, nil
}
