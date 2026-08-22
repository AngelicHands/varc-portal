package auth

import "context"

type contextKey string

const principalKey contextKey = "principal"

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalKey, principal)
}

func PrincipalFromContext(ctx context.Context) Principal {
	value, _ := ctx.Value(principalKey).(Principal)
	return value
}
