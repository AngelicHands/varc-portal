package handler

import (
	"net/http"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/openapi"
)

const scalarDocsHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HAMVN API documentation</title>
</head>
<body>
  <script
    id="api-reference"
    data-url="/openapi.yaml"
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`

func OpenAPIYAML(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(openapi.YAML)
}

func Docs(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/docs" && r.URL.Path != "/docs/" {
		http.NotFound(w, r)
		return
	}
	if r.URL.Path == "/docs/" {
		http.Redirect(w, r, "/docs", http.StatusMovedPermanently)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write([]byte(scalarDocsHTML))
}
