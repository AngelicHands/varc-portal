package qso

import "time"

// AppliedFilters echoes query filters applied to a list request.
type AppliedFilters struct {
	Search         string `json:"search,omitempty"`
	FromDate       string `json:"fromDate,omitempty"`
	ToDate         string `json:"toDate,omitempty"`
	Band           string `json:"band,omitempty"`
	Mode           string `json:"mode,omitempty"`
	WorkedCallsign string `json:"workedCallsign,omitempty"`
	Source         string `json:"source,omitempty"`
	Grid           string `json:"grid,omitempty"`
	QsoSent        *bool  `json:"qso_sent,omitempty"`
	QsoConfirmed   *bool  `json:"qso_confirmed,omitempty"`
}

type ListFilters struct {
	Search         string
	FromDate       *time.Time
	ToDate         *time.Time
	Band           string
	Mode           string
	WorkedCallsign string
	Source         string
	Grid           string
	QsoSent        *bool
	QsoConfirmed   *bool
}

func (f ListFilters) Applied() AppliedFilters {
	out := AppliedFilters{
		Search:         f.Search,
		Band:           f.Band,
		Mode:           f.Mode,
		WorkedCallsign: f.WorkedCallsign,
		Source:         f.Source,
		Grid:           f.Grid,
		QsoSent:        f.QsoSent,
		QsoConfirmed:   f.QsoConfirmed,
	}
	if f.FromDate != nil {
		out.FromDate = f.FromDate.UTC().Format(time.RFC3339)
	}
	if f.ToDate != nil {
		out.ToDate = f.ToDate.UTC().Format(time.RFC3339)
	}
	return out
}
