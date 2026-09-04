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

func TestCanManageCallsigns(t *testing.T) {
	cases := map[string]bool{
		"setup_admin":   true,
		"administrator": true,
		"system_admin":  true, // legacy
		"editor":        false,
		"reader":        false,
		"user":          false, // legacy reader
		"":              false,
		"guest":         false,
	}
	for role, want := range cases {
		if got := CanManageCallsigns(role); got != want {
			t.Fatalf("CanManageCallsigns(%q)=%v want %v", role, got, want)
		}
	}
}
