package qso

import (
	"time"

	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
)

type ListItem struct {
	ID             string   `json:"id"`
	WorkedCallsign string   `json:"workedCallsign"`
	QsoAt          string   `json:"qsoAt"`
	Band           string   `json:"band"`
	FreqMhz        *float64 `json:"freqMhz"`
	Mode           string   `json:"mode"`
	RstSent        string   `json:"rstSent"`
	RstRcvd        string   `json:"rstRcvd"`
	QsoSent        bool     `json:"qso_sent"`
	QsoConfirmed   bool     `json:"qso_confirmed"`
	Source         string   `json:"source"`
	Grid           string   `json:"grid"`
	Notes          string   `json:"notes"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
	HasNext    bool  `json:"hasNext"`
	HasPrev    bool  `json:"hasPrev"`
}

type PageResult struct {
	OK         bool           `json:"ok"`
	Items      []ListItem     `json:"items"`
	Pagination Pagination     `json:"pagination"`
	Filters    AppliedFilters `json:"filters"`
	SortKey    string         `json:"sortKey"`
	SortDir    string         `json:"sortDir"`
}

func ToListItem(doc appmongo.QsoLog) ListItem {
	source := doc.Source
	if source == "" {
		source = "api"
	}
	rstSent := doc.RstSent
	if rstSent == "" {
		rstSent = "59"
	}
	rstRcvd := doc.RstRcvd
	if rstRcvd == "" {
		rstRcvd = "59"
	}
	return ListItem{
		ID:             doc.ID.Hex(),
		WorkedCallsign: doc.WorkedCallsign,
		QsoAt:          doc.QsoAt.UTC().Format(time.RFC3339Nano),
		Band:           doc.Band,
		FreqMhz:        doc.FreqMhz,
		Mode:           doc.Mode,
		RstSent:        rstSent,
		RstRcvd:        rstRcvd,
		QsoSent:        doc.QsoSent,
		QsoConfirmed:   doc.QsoConfirmed,
		Source:         source,
		Grid:           doc.Grid,
		Notes:          doc.Notes,
	}
}
