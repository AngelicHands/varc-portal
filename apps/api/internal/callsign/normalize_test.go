package callsign

import "testing"

func TestNormalizeHelpers(t *testing.T) {
	if got := normalizeCallsignQuery("xv1-a/"); got != "XV1A" {
		t.Fatalf("normalizeCallsignQuery: got %q", got)
	}
	if got := normalizePermitQuery("GP-00123"); got != "123" {
		t.Fatalf("normalizePermitQuery: got %q", got)
	}
	if got := foldSearchText("Nguyễn Văn A"); got != "nguyen van a" {
		t.Fatalf("foldSearchText: got %q", got)
	}
	if got := escapeRegex("a.b+c"); got != `a\.b\+c` {
		t.Fatalf("escapeRegex: got %q", got)
	}
}
