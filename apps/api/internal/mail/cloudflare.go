package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
)

type SendInput struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

type SendResult struct {
	OK    bool
	From  string
	Error string
}

type cfSendResponse struct {
	Success bool `json:"success"`
	Errors  []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func SendCloudflare(ctx context.Context, cfg config.WorkerConfig, input SendInput, clientKey string) SendResult {
	from := cfg.CloudflareMail.From
	if !cfg.CloudflareMail.Configured {
		return SendResult{OK: false, From: from, Error: "Cloudflare mail is not configured"}
	}
	to := strings.TrimSpace(input.To)
	if to == "" {
		return SendResult{OK: false, From: from, Error: "Missing recipient"}
	}

	payload := map[string]string{
		"to":      to,
		"from":    from,
		"subject": input.Subject,
		"text":    input.Text,
	}
	if strings.TrimSpace(input.HTML) != "" {
		payload["html"] = input.HTML
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/email/sending/send",
		cfg.CloudflareMail.AccountID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return SendResult{OK: false, From: from, Error: "Failed to send email"}
	}
	req.Header.Set("Authorization", "Bearer "+cfg.CloudflareMail.APIToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return SendResult{OK: false, From: from, Error: "Failed to send email"}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var parsed cfSendResponse
	_ = json.Unmarshal(raw, &parsed)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !parsed.Success {
		detail := fmt.Sprintf("HTTP %d", resp.StatusCode)
		if len(parsed.Errors) > 0 && parsed.Errors[0].Message != "" {
			detail = parsed.Errors[0].Message
		}
		return SendResult{OK: false, From: from, Error: detail}
	}
	return SendResult{OK: true, From: from}
}

func EscapeHTML(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
	)
	return replacer.Replace(value)
}
