package mongo

import (
	"context"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Client struct {
	db *mongo.Database
}

func Connect(ctx context.Context, uri string) (*Client, error) {
	opts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}
	return &Client{db: client.Database(databaseName(uri))}, nil
}

func databaseName(uri string) string {
	parsed, err := url.Parse(uri)
	if err != nil {
		return "varc"
	}
	name := strings.TrimPrefix(parsed.Path, "/")
	if idx := strings.Index(name, "?"); idx >= 0 {
		name = name[:idx]
	}
	if name == "" {
		return "varc"
	}
	return name
}

func (c *Client) DB() *mongo.Database {
	return c.db
}

func (c *Client) Ping(ctx context.Context) error {
	return c.db.Client().Ping(ctx, nil)
}

func (c *Client) Close(ctx context.Context) error {
	return c.db.Client().Disconnect(ctx)
}

type ApiToken struct {
	ID          primitive.ObjectID `bson:"_id"`
	UserID      primitive.ObjectID `bson:"userId"`
	Name        string             `bson:"name"`
	TokenPrefix string             `bson:"tokenPrefix"`
	TokenHash   string             `bson:"tokenHash"`
	Scopes      []string           `bson:"scopes"`
	ExpiresAt   *time.Time         `bson:"expiresAt,omitempty"`
	LastUsedAt  *time.Time         `bson:"lastUsedAt,omitempty"`
	RevokedAt   *time.Time         `bson:"revokedAt,omitempty"`
}

type QsoLog struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"`
	UserID        primitive.ObjectID `bson:"userId"`
	WorkedCallsign string            `bson:"workedCallsign"`
	QsoAt         time.Time          `bson:"qsoAt"`
	Band          string             `bson:"band"`
	FreqMhz       *float64           `bson:"freqMhz,omitempty"`
	Mode          string             `bson:"mode"`
	RstSent       string             `bson:"rstSent"`
	RstRcvd       string             `bson:"rstRcvd"`
	QsoSent       bool               `bson:"qso_sent"`
	QsoConfirmed  bool               `bson:"qso_confirmed"`
	Source        string             `bson:"source"`
	Grid          string             `bson:"grid"`
	Notes         string             `bson:"notes"`
	CreatedAt     time.Time          `bson:"createdAt,omitempty"`
	UpdatedAt     time.Time          `bson:"updatedAt,omitempty"`
}

type User struct {
	ID       primitive.ObjectID `bson:"_id"`
	Callsign string             `bson:"callsign"`
	Role     string             `bson:"role"`
}

type Callsign struct {
	ID                 primitive.ObjectID   `bson:"_id,omitempty"`
	Sign               string               `bson:"sign"`
	PrefixFamily       string               `bson:"prefixFamily"`
	AreaDigit          *string              `bson:"areaDigit,omitempty"`
	OperatorIds        []primitive.ObjectID `bson:"operatorIds,omitempty"`
	LatestLicenseID    *primitive.ObjectID  `bson:"latestLicenseId,omitempty"`
	EventCount         int                  `bson:"eventCount"`
	SearchNames        []string             `bson:"searchNames,omitempty"`
	SearchPermits      []string             `bson:"searchPermits,omitempty"`
	LatestOperatorName string               `bson:"latestOperatorName"`
	LatestIssuedAt     *time.Time           `bson:"latestIssuedAt,omitempty"`
	LatestExpiresAt    *time.Time           `bson:"latestExpiresAt,omitempty"`
	LatestPermitRaw    string               `bson:"latestPermitRaw"`
	LatestStatus       string               `bson:"latestStatus"`
}

type CallsignLicense struct {
	ID           primitive.ObjectID   `bson:"_id,omitempty"`
	ImportKey    string               `bson:"importKey"`
	Stt          int                  `bson:"stt"`
	OperatorID   primitive.ObjectID   `bson:"operatorId"`
	OperatorName string               `bson:"operatorName"`
	CallsignIds  []primitive.ObjectID `bson:"callsignIds,omitempty"`
	CallsignRaw  string               `bson:"callsignRaw"`
	Callsigns    []string             `bson:"callsigns,omitempty"`
	PermitRaw    string               `bson:"permitRaw"`
	PermitNumber string               `bson:"permitNumber"`
	PermitType   string               `bson:"permitType"`
	RenewalIndex *int                 `bson:"renewalIndex,omitempty"`
	IssuedAt     *time.Time           `bson:"issuedAt,omitempty"`
	ExpiresAt    *time.Time           `bson:"expiresAt,omitempty"`
	Status       string               `bson:"status"`
	Notes        string               `bson:"notes"`
	Flags        []string             `bson:"flags,omitempty"`
}

type Store struct {
	tokens           *mongo.Collection
	qsos             *mongo.Collection
	users            *mongo.Collection
	callsigns        *mongo.Collection
	callsignLicenses *mongo.Collection
}

func NewStore(db *mongo.Database) *Store {
	return &Store{
		tokens:           db.Collection("apitokens"),
		qsos:             db.Collection("qsologs"),
		users:            db.Collection("users"),
		callsigns:        db.Collection("callsigns"),
		callsignLicenses: db.Collection("callsignlicenses"),
	}
}

func (s *Store) Qsos() *mongo.Collection {
	return s.qsos
}

func (s *Store) Callsigns() *mongo.Collection {
	return s.callsigns
}

func (s *Store) CallsignLicenses() *mongo.Collection {
	return s.callsignLicenses
}

func (s *Store) FindActiveTokenByPrefix(ctx context.Context, prefix string) (*ApiToken, error) {
	filter := bson.M{
		"tokenPrefix": prefix,
		"$or": []bson.M{
			{"revokedAt": nil},
			{"revokedAt": bson.M{"$exists": false}},
		},
	}
	var doc ApiToken
	err := s.tokens.FindOne(ctx, filter).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (s *Store) FindActiveTokenByID(ctx context.Context, id primitive.ObjectID) (*ApiToken, error) {
	filter := bson.M{
		"_id": id,
		"$or": []bson.M{
			{"revokedAt": nil},
			{"revokedAt": bson.M{"$exists": false}},
		},
	}
	var doc ApiToken
	err := s.tokens.FindOne(ctx, filter).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (s *Store) TouchTokenLastUsed(ctx context.Context, id primitive.ObjectID) {
	now := time.Now().UTC()
	_, _ = s.tokens.UpdateByID(ctx, id, bson.M{"$set": bson.M{"lastUsedAt": now}})
}

func (s *Store) UserCallsign(ctx context.Context, userID primitive.ObjectID) (string, error) {
	var user User
	err := s.users.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return user.Callsign, nil
}

func (s *Store) UserRole(ctx context.Context, userID primitive.ObjectID) (string, error) {
	var user User
	err := s.users.FindOne(ctx, bson.M{"_id": userID}, options.FindOne().SetProjection(bson.M{"role": 1})).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return user.Role, nil
}
