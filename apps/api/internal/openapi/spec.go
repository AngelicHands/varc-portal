package openapi

import _ "embed"

// YAML is the embedded OpenAPI 3.1 specification.
// Source of truth: apps/api/openapi.yaml — copy to spec.yaml when the spec changes.
//
//go:embed spec.yaml
var YAML []byte
