package callsign

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var nonAlnum = regexp.MustCompile(`[^A-Z0-9]`)
var nonDigit = regexp.MustCompile(`\D`)
var leadingZeros = regexp.MustCompile(`^0+`)
var multiSpace = regexp.MustCompile(`\s+`)
var nonNameChars = regexp.MustCompile(`[^a-z0-9\s]`)

func foldSearchText(value string) string {
	decomposed := norm.NFD.String(value)
	var b strings.Builder
	b.Grow(len(decomposed))
	for _, r := range decomposed {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	folded := nonNameChars.ReplaceAllString(b.String(), " ")
	return strings.TrimSpace(multiSpace.ReplaceAllString(folded, " "))
}

func normalizeCallsignQuery(value string) string {
	return nonAlnum.ReplaceAllString(strings.ToUpper(value), "")
}

func normalizePermitQuery(value string) string {
	digits := nonDigit.ReplaceAllString(value, "")
	return leadingZeros.ReplaceAllString(digits, "")
}

func escapeRegex(value string) string {
	var b strings.Builder
	b.Grow(len(value) * 2)
	for _, r := range value {
		switch r {
		case '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func normalizeSearchQuery(raw string) string {
	q := strings.TrimSpace(raw)
	if len(q) > 80 {
		q = q[:80]
	}
	return q
}
