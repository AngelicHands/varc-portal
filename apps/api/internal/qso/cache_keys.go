package qso

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
)

func ListCacheFilterHash(params ListParams) string {
	applied := params.Filters.Applied()
	payload, _ := json.Marshal(map[string]any{
		"search":         applied.Search,
		"fromDate":       applied.FromDate,
		"toDate":         applied.ToDate,
		"band":           applied.Band,
		"mode":           applied.Mode,
		"workedCallsign": applied.WorkedCallsign,
		"source":         applied.Source,
		"grid":           applied.Grid,
		"qso_sent":       applied.QsoSent,
		"qso_confirmed":  applied.QsoConfirmed,
		"page":           params.Page,
		"pageSize":       params.PageSize,
		"sortKey":        params.SortKey,
		"sortDir":        params.SortDir,
	})
	sum := sha1.Sum(payload)
	return hex.EncodeToString(sum[:])[:16]
}
