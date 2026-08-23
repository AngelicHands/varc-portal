package importexportworker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type httpExecutor struct {
	baseURL string
	secret  string
}

type runErrorResponse struct {
	Error string `json:"error"`
}

func (e *httpExecutor) RunJob(ctx context.Context, jobID string) error {
	url := fmt.Sprintf("%s/api/internal/import-export/jobs/%s/run", e.baseURL, jobID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.secret)

	client := &http.Client{Timeout: 45 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("portal request failed")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	var parsed runErrorResponse
	_ = json.Unmarshal(body, &parsed)
	msg := strings.TrimSpace(parsed.Error)
	if msg == "" {
		msg = fmt.Sprintf("portal returned HTTP %d", resp.StatusCode)
	}
	return fmt.Errorf("%s", msg)
}
