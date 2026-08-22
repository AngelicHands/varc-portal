# syntax=docker/dockerfile:1

FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/varc-api ./cmd/server

FROM alpine:3.21
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /out/varc-api /app/varc-api
USER app
EXPOSE 3100
ENV API_PORT=3100
ENTRYPOINT ["/app/varc-api"]
