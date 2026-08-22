package auth

import "testing"

func TestHashTokenDeterministic(t *testing.T) {
	a := HashToken("varc_abc123", "pepper")
	b := HashToken("varc_abc123", "pepper")
	if a != b {
		t.Fatalf("expected deterministic hash")
	}
	if HashToken("varc_abc123", "other") == a {
		t.Fatalf("expected different pepper to change hash")
	}
}

func TestConstantTimeEqual(t *testing.T) {
	if !constantTimeEqual("abc", "abc") {
		t.Fatalf("expected equal strings to match")
	}
	if constantTimeEqual("abc", "abd") {
		t.Fatalf("expected different strings to mismatch")
	}
	if constantTimeEqual("abc", "ab") {
		t.Fatalf("expected different lengths to mismatch")
	}
}
