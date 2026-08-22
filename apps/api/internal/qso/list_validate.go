package qso

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	allowedListQueryKeys = map[string]struct{}{
		"page": {}, "pageSize": {}, "q": {}, "sort": {}, "dir": {},
		"fromDate": {}, "toDate": {}, "band": {}, "mode": {},
		"workedCallsign": {}, "source": {}, "grid": {},
		"qso_sent": {}, "qso_confirmed": {},
	}

	dateOnlyPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	positiveIntPattern = regexp.MustCompile(`^[1-9][0-9]*$`)
	modeFilterPattern  = regexp.MustCompile(`^[A-Za-z0-9/+.\-_ ]{1,32}$`)
	maidenheadPattern  = regexp.MustCompile(`(?i)^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?)?)?$`)
)

const (
	minQsoFilterYear = 1900
	maxQsoFilterYear = 2100
	maxSearchLength  = 80
)

func validateListQueryKeys(values map[string][]string) error {
	for key, items := range values {
		if _, ok := allowedListQueryKeys[key]; !ok {
			return validationError(fmt.Sprintf("Unknown query parameter: %s", key))
		}
		if len(items) > 1 {
			return validationError(fmt.Sprintf("Duplicate query parameter: %s", key))
		}
	}
	return nil
}

func validateSearchFilter(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > maxSearchLength {
		return "", validationError(fmt.Sprintf("Search must be at most %d characters", maxSearchLength))
	}
	for _, ch := range raw {
		if ch < 32 || ch == 127 {
			return "", validationError("Search contains invalid characters")
		}
	}
	return raw, nil
}

func validateBandFilter(raw string, present bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return "", validationError("band cannot be empty")
		}
		return "", nil
	}
	if _, ok := qsoBands[raw]; !ok {
		return "", validationError("Invalid band")
	}
	return raw, nil
}

func validateModeFilter(raw string, present bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return "", validationError("mode cannot be empty")
		}
		return "", nil
	}
	if !modeFilterPattern.MatchString(raw) {
		return "", validationError("Invalid mode")
	}
	return raw, nil
}

func validateWorkedCallsignFilter(raw string, present bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return "", validationError("workedCallsign cannot be empty")
		}
		return "", nil
	}
	normalized := NormalizeCallsign(raw)
	if !isValidCallsign(normalized) {
		return "", validationError("Invalid workedCallsign")
	}
	return normalized, nil
}

func validateSourceFilter(raw string, present bool) (string, error) {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		if present {
			return "", validationError("source cannot be empty")
		}
		return "", nil
	}
	if _, ok := qsoSources[raw]; !ok {
		return "", validationError("Invalid source")
	}
	return raw, nil
}

func validateGridFilter(raw string, present bool) (string, error) {
	raw = normalizeGridFilter(raw)
	if raw == "" {
		if present {
			return "", validationError("grid cannot be empty")
		}
		return "", nil
	}
	if !isValidMaidenheadGrid(raw) {
		return "", validationError("Invalid grid")
	}
	return raw, nil
}

func normalizeGridFilter(raw string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(raw), " ", ""))
}

func isValidMaidenheadGrid(raw string) bool {
	grid := normalizeGridFilter(raw)
	if len(grid) < 4 || len(grid) > 12 || len(grid)%2 != 0 {
		return false
	}
	return maidenheadPattern.MatchString(grid)
}

func validateStrictBoolFilter(raw string, field string, present bool) (*bool, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		if present {
			return nil, validationError(fmt.Sprintf("%s cannot be empty", field))
		}
		return nil, nil
	}
	switch raw {
	case "true":
		v := true
		return &v, nil
	case "false":
		v := false
		return &v, nil
	default:
		return nil, validationError(fmt.Sprintf("Invalid %s; use true or false", field))
	}
}

func validatePageFilter(raw string, present bool) (int, error) {
	if !present || strings.TrimSpace(raw) == "" {
		return 1, nil
	}
	raw = strings.TrimSpace(raw)
	if !positiveIntPattern.MatchString(raw) {
		return 0, validationError("Invalid page")
	}
	n, err := parseInt(raw)
	if err != nil || n < 1 {
		return 0, validationError("Invalid page")
	}
	return n, nil
}

func validatePageSizeFilter(raw string, present bool) (int, error) {
	if !present || strings.TrimSpace(raw) == "" {
		return DefaultPageSize, nil
	}
	raw = strings.TrimSpace(raw)
	if !positiveIntPattern.MatchString(raw) {
		return 0, validationError("Invalid pageSize")
	}
	n, err := parseInt(raw)
	if err != nil || n < MinPageSize {
		return 0, validationError("Invalid pageSize")
	}
	return clampPageSize(n), nil
}

func validateSortFilter(raw string, present bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return "", validationError("sort cannot be empty")
		}
		return "qsoAt", nil
	}
	if _, ok := sortKeys[raw]; !ok {
		return "", validationError("Invalid sort")
	}
	return raw, nil
}

func validateDirFilter(raw, sortKey string, present bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return "", validationError("dir cannot be empty")
		}
		if sortKey != "qsoAt" {
			return "asc", nil
		}
		return "desc", nil
	}
	if raw != "asc" && raw != "desc" {
		return "", validationError("Invalid dir")
	}
	return raw, nil
}

func parseFilterDate(raw string, endOfDay bool, present bool) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if present {
			return nil, validationError("Date cannot be empty")
		}
		return nil, nil
	}

	var parsed time.Time
	var err error

	if dateOnlyPattern.MatchString(raw) {
		parsed, err = time.Parse("2006-01-02", raw)
		if err != nil {
			return nil, validationError("Invalid date; use YYYY-MM-DD")
		}
		var utc time.Time
		if endOfDay {
			utc = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 23, 59, 59, 999999999, time.UTC)
		} else {
			utc = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
		}
		if err := validateQsoFilterDateBounds(utc); err != nil {
			return nil, err
		}
		return &utc, nil
	}

	parsed, err = time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, validationError("Invalid date; use YYYY-MM-DD or RFC3339")
	}
	utc := parsed.UTC()
	if err := validateQsoFilterDateBounds(utc); err != nil {
		return nil, err
	}
	return &utc, nil
}

func validateQsoFilterDateBounds(t time.Time) error {
	year := t.Year()
	if year < minQsoFilterYear || year > maxQsoFilterYear {
		return validationError(fmt.Sprintf("Date must be between %d and %d", minQsoFilterYear, maxQsoFilterYear))
	}
	return nil
}

func queryPresent(values map[string][]string, key string) bool {
	items, ok := values[key]
	return ok && len(items) > 0
}

func queryValue(values map[string][]string, key string) string {
	items := values[key]
	if len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(items[0])
}
