package callsign

import (
	"time"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

const DefaultPageSize = 30
const MaxPageSize = 100

type ListItem struct {
	Sign         string  `json:"sign"`
	OperatorName string  `json:"operatorName"`
	PermitRaw    string  `json:"permitRaw"`
	IssuedAt     *string `json:"issuedAt"`
	ExpiresAt    *string `json:"expiresAt"`
	Status       string  `json:"status"`
	EventCount   int     `json:"eventCount"`
	PrefixFamily string  `json:"prefixFamily"`
	AreaDigit    *string `json:"areaDigit"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
	HasNext    bool  `json:"hasNext"`
	HasPrev    bool  `json:"hasPrev"`
}

type SearchResult struct {
	OK         bool       `json:"ok"`
	Query      string     `json:"query"`
	Items      []ListItem `json:"items"`
	Pagination Pagination `json:"pagination"`
}

type LicenseItem struct {
	Stt          int      `json:"stt"`
	OperatorName string   `json:"operatorName"`
	CallsignRaw  string   `json:"callsignRaw"`
	Callsigns    []string `json:"callsigns"`
	PermitRaw    string   `json:"permitRaw"`
	PermitType   string   `json:"permitType"`
	IssuedAt     *string  `json:"issuedAt"`
	ExpiresAt    *string  `json:"expiresAt"`
	Status       string   `json:"status"`
	Notes        string   `json:"notes"`
	Flags        []string `json:"flags"`
}

type Detail struct {
	Sign         string        `json:"sign"`
	PrefixFamily string        `json:"prefixFamily"`
	AreaDigit    *string       `json:"areaDigit"`
	OperatorName string        `json:"operatorName"`
	EventCount   int           `json:"eventCount"`
	LatestStatus string        `json:"latestStatus"`
	Licenses     []LicenseItem `json:"licenses"`
}

type DetailResult struct {
	OK       bool   `json:"ok"`
	Callsign Detail `json:"callsign"`
}

type Stats struct {
	Callsigns int64 `json:"callsigns"`
	Operators int   `json:"operators"`
	Events    int64 `json:"events"`
	Expired   int64 `json:"expired"`
}

type StatsResult struct {
	OK    bool  `json:"ok"`
	Stats Stats `json:"stats"`
}

func toIso(t *time.Time) *string {
	if t == nil || t.IsZero() {
		return nil
	}
	s := t.UTC().Format(time.RFC3339Nano)
	return &s
}

func toListItem(doc appmongo.Callsign) ListItem {
	var area *string
	if doc.AreaDigit != nil && *doc.AreaDigit != "" {
		area = doc.AreaDigit
	}
	status := doc.LatestStatus
	if status == "" {
		status = "unknown"
	}
	return ListItem{
		Sign:         doc.Sign,
		OperatorName: doc.LatestOperatorName,
		PermitRaw:    doc.LatestPermitRaw,
		IssuedAt:     toIso(doc.LatestIssuedAt),
		ExpiresAt:    toIso(doc.LatestExpiresAt),
		Status:       status,
		EventCount:   doc.EventCount,
		PrefixFamily: doc.PrefixFamily,
		AreaDigit:    area,
	}
}

func toLicenseItem(doc appmongo.CallsignLicense) LicenseItem {
	flags := doc.Flags
	if flags == nil {
		flags = []string{}
	}
	callsigns := doc.Callsigns
	if callsigns == nil {
		callsigns = []string{}
	}
	status := doc.Status
	if status == "" {
		status = "unknown"
	}
	return LicenseItem{
		Stt:          doc.Stt,
		OperatorName: doc.OperatorName,
		CallsignRaw:  doc.CallsignRaw,
		Callsigns:    callsigns,
		PermitRaw:    doc.PermitRaw,
		PermitType:   doc.PermitType,
		IssuedAt:     toIso(doc.IssuedAt),
		ExpiresAt:    toIso(doc.ExpiresAt),
		Status:       status,
		Notes:        doc.Notes,
		Flags:        flags,
	}
}
