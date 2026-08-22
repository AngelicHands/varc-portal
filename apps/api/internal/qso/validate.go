package qso

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

var ErrValidation = errors.New("validation")

var (
	callsignPattern = regexp.MustCompile(`^[A-Z0-9/]{3,15}$`)
	freqPattern     = regexp.MustCompile(`^\d+(\.\d+)?$`)
)

var qsoBands = map[string]struct{}{
	"160m": {}, "80m": {}, "60m": {}, "40m": {}, "30m": {}, "20m": {},
	"17m": {}, "15m": {}, "12m": {}, "10m": {}, "6m": {}, "2m": {},
	"70cm": {}, "23cm": {}, "other": {},
}

var reservedCallsigns = map[string]struct{}{
	"ADMIN": {}, "API": {}, "MEDIA": {}, "ACCOUNT": {}, "CALLSIGNS": {},
	"CATEGORIES": {}, "LOGBOOK": {}, "NEWS": {}, "PAGES": {}, "QSO": {},
	"VI": {}, "EN": {}, "ROBOTS": {}, "SITEMAP": {}, "FAVICON": {},
	"MAPLIBRE": {}, "_NEXT": {},
}

var sortKeys = map[string]struct{}{
	"qsoAt": {}, "workedCallsign": {}, "band": {}, "mode": {}, "grid": {},
}

var qsoSources = map[string]struct{}{
	"portal": {}, "api": {}, "qrz": {}, "eqsl": {}, "adif": {},
}

const (
	DefaultPageSize = 1000
	MaxPageSize     = 1000
	MinPageSize     = 1
)

type Input struct {
	WorkedCallsign string  `json:"workedCallsign"`
	QsoAt          string  `json:"qsoAt"`
	Band           string  `json:"band"`
	FreqMhz        float64 `json:"freqMhz"`
	Mode           string  `json:"mode"`
	RstSent        string  `json:"rstSent"`
	RstRcvd        string  `json:"rstRcvd"`
	QsoSent        bool    `json:"qso_sent"`
	Grid           string  `json:"grid"`
	Notes          string  `json:"notes"`
}

type ListParams struct {
	Page     int
	PageSize int
	Filters  ListFilters
	SortKey  string
	SortDir  string
}

type ValidationError struct {
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}

func validationError(message string) error {
	return ValidationError{Message: message}
}

func NormalizeCallsign(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	var b strings.Builder
	for _, ch := range value {
		if (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '/' {
			b.WriteRune(ch)
		}
	}
	return b.String()
}

func isValidCallsign(value string) bool {
	normalized := NormalizeCallsign(value)
	if len(normalized) < 3 || len(normalized) > 15 {
		return false
	}
	if _, reserved := reservedCallsigns[normalized]; reserved {
		return false
	}
	return callsignPattern.MatchString(normalized)
}

func isValidFreqMhz(value float64) bool {
	if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return false
	}
	return freqPattern.MatchString(strings.TrimRight(strings.TrimRight(fmt.Sprintf("%f", value), "0"), "."))
}

func ValidateInput(raw Input) (Input, error) {
	out := Input{
		WorkedCallsign: NormalizeCallsign(raw.WorkedCallsign),
		QsoAt:          strings.TrimSpace(raw.QsoAt),
		Band:           strings.TrimSpace(raw.Band),
		Mode:           strings.TrimSpace(raw.Mode),
		RstSent:        strings.TrimSpace(raw.RstSent),
		RstRcvd:        strings.TrimSpace(raw.RstRcvd),
		QsoSent:        raw.QsoSent,
		Grid:           strings.ToUpper(strings.TrimSpace(raw.Grid)),
		Notes:          strings.TrimSpace(raw.Notes),
	}

	if !isValidCallsign(out.WorkedCallsign) {
		return Input{}, validationError("Enter a valid contact callsign")
	}
	if out.QsoAt == "" {
		return Input{}, validationError("QSO date/time is required")
	}
	if _, err := time.Parse(time.RFC3339, out.QsoAt); err != nil {
		return Input{}, validationError("Enter a valid QSO date/time")
	}
	if _, ok := qsoBands[out.Band]; !ok {
		return Input{}, validationError("Select a valid band")
	}
	if !isValidFreqMhz(raw.FreqMhz) {
		return Input{}, validationError("Enter a valid frequency")
	}
	out.FreqMhz = raw.FreqMhz
	if out.Mode == "" || len(out.Mode) > 32 {
		return Input{}, validationError("Mode is required")
	}
	if out.RstSent == "" {
		out.RstSent = "59"
	}
	if len(out.RstSent) > 16 {
		return Input{}, validationError("RST sent is too long")
	}
	if out.RstRcvd == "" {
		out.RstRcvd = "59"
	}
	if len(out.RstRcvd) > 16 {
		return Input{}, validationError("RST received is too long")
	}
	if out.Grid == "" {
		return Input{}, validationError("Grid location is required")
	}
	out.Grid = normalizeGridFilter(out.Grid)
	if !isValidMaidenheadGrid(out.Grid) {
		return Input{}, validationError("Enter a valid grid locator")
	}
	if len(out.Notes) > 2000 {
		return Input{}, validationError("Notes are too long")
	}
	return out, nil
}

func ParseListParams(pageRaw, pageSizeRaw, searchRaw, sortRaw, dirRaw string) (ListParams, error) {
	return ParseListQuery(map[string][]string{
		"page":     {pageRaw},
		"pageSize": {pageSizeRaw},
		"q":        {searchRaw},
		"sort":     {sortRaw},
		"dir":      {dirRaw},
	})
}

func ParseListQuery(values map[string][]string) (ListParams, error) {
	if err := validateListQueryKeys(values); err != nil {
		return ListParams{}, err
	}

	search, err := validateSearchFilter(queryValue(values, "q"))
	if err != nil {
		return ListParams{}, err
	}
	if queryPresent(values, "q") && search == "" {
		return ListParams{}, validationError("q cannot be empty")
	}

	pageSize, err := validatePageSizeFilter(queryValue(values, "pageSize"), queryPresent(values, "pageSize"))
	if err != nil {
		return ListParams{}, err
	}

	page, err := validatePageFilter(queryValue(values, "page"), queryPresent(values, "page"))
	if err != nil {
		return ListParams{}, err
	}

	sortKey, err := validateSortFilter(queryValue(values, "sort"), queryPresent(values, "sort"))
	if err != nil {
		return ListParams{}, err
	}

	sortDir, err := validateDirFilter(queryValue(values, "dir"), sortKey, queryPresent(values, "dir"))
	if err != nil {
		return ListParams{}, err
	}

	fromDate, err := parseFilterDate(queryValue(values, "fromDate"), false, queryPresent(values, "fromDate"))
	if err != nil {
		return ListParams{}, err
	}
	toDate, err := parseFilterDate(queryValue(values, "toDate"), true, queryPresent(values, "toDate"))
	if err != nil {
		return ListParams{}, err
	}
	if fromDate != nil && toDate != nil && fromDate.After(*toDate) {
		return ListParams{}, validationError("fromDate must be before or equal to toDate")
	}

	band, err := validateBandFilter(queryValue(values, "band"), queryPresent(values, "band"))
	if err != nil {
		return ListParams{}, err
	}

	mode, err := validateModeFilter(queryValue(values, "mode"), queryPresent(values, "mode"))
	if err != nil {
		return ListParams{}, err
	}

	workedCallsign, err := validateWorkedCallsignFilter(
		queryValue(values, "workedCallsign"),
		queryPresent(values, "workedCallsign"),
	)
	if err != nil {
		return ListParams{}, err
	}

	source, err := validateSourceFilter(queryValue(values, "source"), queryPresent(values, "source"))
	if err != nil {
		return ListParams{}, err
	}

	grid, err := validateGridFilter(queryValue(values, "grid"), queryPresent(values, "grid"))
	if err != nil {
		return ListParams{}, err
	}

	qsoSent, err := validateStrictBoolFilter(queryValue(values, "qso_sent"), "qso_sent", queryPresent(values, "qso_sent"))
	if err != nil {
		return ListParams{}, err
	}
	qsoConfirmed, err := validateStrictBoolFilter(
		queryValue(values, "qso_confirmed"),
		"qso_confirmed",
		queryPresent(values, "qso_confirmed"),
	)
	if err != nil {
		return ListParams{}, err
	}

	return ListParams{
		Page:     page,
		PageSize: pageSize,
		Filters: ListFilters{
			Search:         search,
			FromDate:       fromDate,
			ToDate:         toDate,
			Band:           band,
			Mode:           mode,
			WorkedCallsign: workedCallsign,
			Source:         source,
			Grid:           grid,
			QsoSent:        qsoSent,
			QsoConfirmed:   qsoConfirmed,
		},
		SortKey: sortKey,
		SortDir: sortDir,
	}, nil
}

func clampPageSize(n int) int {
	if n < MinPageSize {
		return MinPageSize
	}
	if n > MaxPageSize {
		return MaxPageSize
	}
	return n
}

func parseInt(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, fmt.Errorf("empty")
	}
	var n int
	_, err := fmt.Sscanf(raw, "%d", &n)
	return n, err
}

func EscapeRegex(value string) string {
	var b strings.Builder
	for _, ch := range value {
		switch ch {
		case '.', '+', '*', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\':
			b.WriteRune('\\')
			b.WriteRune(ch)
		default:
			b.WriteRune(ch)
		}
	}
	return b.String()
}
