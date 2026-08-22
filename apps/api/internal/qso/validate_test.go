package qso

import "testing"

func TestValidateInputSuccess(t *testing.T) {
	_, err := ValidateInput(Input{
		WorkedCallsign: "xv1abc",
		QsoAt:          "2026-08-22T10:00:00.000Z",
		Band:           "20m",
		FreqMhz:        14.074,
		Mode:           "FT8",
		RstSent:        "59",
		RstRcvd:        "59",
		QsoSent:        true,
		Grid:           "OK30",
		Notes:          "",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateInputReservedCallsign(t *testing.T) {
	_, err := ValidateInput(Input{
		WorkedCallsign: "API",
		QsoAt:          "2026-08-22T10:00:00.000Z",
		Band:           "20m",
		FreqMhz:        14.074,
		Mode:           "FT8",
		Grid:           "OK30",
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
}

func TestValidateInputInvalidGrid(t *testing.T) {
	_, err := ValidateInput(Input{
		WorkedCallsign: "XV1ABC",
		QsoAt:          "2026-08-22T10:00:00.000Z",
		Band:           "20m",
		FreqMhz:        14.074,
		Mode:           "FT8",
		Grid:           "ZZ99",
	})
	if err == nil {
		t.Fatalf("expected invalid grid error")
	}
}

func TestListCacheFilterHashStable(t *testing.T) {
	params := ListParams{
		Page:     1,
		PageSize: 100,
		SortKey:  "qsoAt",
		SortDir:  "desc",
		Filters:  ListFilters{Band: "20m"},
	}
	a := ListCacheFilterHash(params)
	b := ListCacheFilterHash(params)
	if a != b || a == "" {
		t.Fatalf("expected stable non-empty hash, got %q and %q", a, b)
	}
}

func TestParseListParamsDefaults(t *testing.T) {
	params, err := ParseListQuery(map[string][]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if params.Page != 1 || params.PageSize != DefaultPageSize || params.SortKey != "qsoAt" || params.SortDir != "desc" {
		t.Fatalf("unexpected defaults: %+v", params)
	}
}

func TestParseListParamsPageSizeClamp(t *testing.T) {
	params, err := ParseListQuery(map[string][]string{"pageSize": {"5000"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if params.PageSize != MaxPageSize {
		t.Fatalf("expected clamp to %d, got %d", MaxPageSize, params.PageSize)
	}
	params, err = ParseListQuery(map[string][]string{"pageSize": {"50"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if params.PageSize != 50 {
		t.Fatalf("expected 50, got %d", params.PageSize)
	}
}

func TestParseListQueryDateRange(t *testing.T) {
	params, err := ParseListQuery(map[string][]string{
		"fromDate": {"2026-01-01"},
		"toDate":   {"2026-01-31"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if params.Filters.FromDate == nil || params.Filters.ToDate == nil {
		t.Fatalf("expected date filters")
	}
}

func TestParseListQueryInvalidDateRange(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{
		"fromDate": {"2026-02-01"},
		"toDate":   {"2026-01-01"},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
}

func TestParseListQueryRejectsUnknownParam(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"foo": {"bar"}})
	if err == nil {
		t.Fatalf("expected unknown param error")
	}
}

func TestParseListQueryRejectsDuplicateParam(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"page": {"1", "2"}})
	if err == nil {
		t.Fatalf("expected duplicate param error")
	}
}

func TestParseListQueryRejectsEmptyBand(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"band": {""}})
	if err == nil {
		t.Fatalf("expected empty band error")
	}
}

func TestParseListQueryRejectsInvalidBand(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"band": {"999m"}})
	if err == nil {
		t.Fatalf("expected invalid band error")
	}
}

func TestParseListQueryRejectsInvalidGrid(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"grid": {"ZZ99"}})
	if err == nil {
		t.Fatalf("expected invalid grid error")
	}
}

func TestParseListQueryAcceptsValidGrid(t *testing.T) {
	params, err := ParseListQuery(map[string][]string{"grid": {"OK30"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if params.Filters.Grid != "OK30" {
		t.Fatalf("expected OK30, got %q", params.Filters.Grid)
	}
}

func TestParseListQueryRejectsLooseBool(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"qso_sent": {"yes"}})
	if err == nil {
		t.Fatalf("expected strict bool error")
	}
}

func TestParseListQueryRejectsInvalidDateFormat(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"fromDate": {"01/01/2026"}})
	if err == nil {
		t.Fatalf("expected invalid date error")
	}
}

func TestParseListQueryRejectsSearchTooLong(t *testing.T) {
	long := make([]byte, 81)
	for i := range long {
		long[i] = 'a'
	}
	_, err := ParseListQuery(map[string][]string{"q": {string(long)}})
	if err == nil {
		t.Fatalf("expected search length error")
	}
}

func TestParseListQueryRejectsInvalidPage(t *testing.T) {
	_, err := ParseListQuery(map[string][]string{"page": {"0"}})
	if err == nil {
		t.Fatalf("expected invalid page error")
	}
	_, err = ParseListQuery(map[string][]string{"page": {"1.5"}})
	if err == nil {
		t.Fatalf("expected invalid page error")
	}
}
