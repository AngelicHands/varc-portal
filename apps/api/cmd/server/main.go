package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/handler"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/middleware"
	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/qso"
)

func main() {
	cfg := config.Load()
	if cfg.MongoURI == "" {
		log.Fatal("MONGODB_URI is required")
	}
	if cfg.TokenPepper == "" {
		log.Fatal("API_TOKEN_PEPPER or AUTH_SECRET is required")
	}

	ctx := context.Background()
	mongoClient, err := appmongo.Connect(ctx, cfg.MongoURI)
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = mongoClient.Close(shutdownCtx)
	}()

	valkeyClient, err := cache.Connect(ctx, cfg.ValkeyURL, cfg.ValkeyPassword)
	if err != nil {
		if cfg.ValkeyURL == "" {
			log.Printf("valkey: not configured (VALKEY_URL unset); cache invalidation and rate limits disabled")
		} else {
			log.Printf("valkey unavailable: %v; cache invalidation and rate limits degraded", err)
		}
		valkeyClient = &cache.Valkey{}
	} else {
		log.Printf("valkey: connected")
	}
	defer valkeyClient.Close()

	store := appmongo.NewStore(mongoClient.DB())
	qsoService := qso.NewService(store)
	qsoHandler := handler.QsoHandler{Service: qsoService, Valkey: valkeyClient}

	router := chi.NewRouter()
	router.Use(middleware.Recover)
	router.Use(middleware.RequestID)
	router.Use(middleware.SecurityHeaders)
	router.Use(middleware.CORS(cfg))
	router.Use(middleware.RateLimit(cfg, valkeyClient))
	router.Use(middleware.BearerAuth(cfg, store))
	router.Use(middleware.AuthenticatedRateLimit(cfg, valkeyClient))

	router.Get("/health", handler.NewHealthHandler(mongoClient).ServeHTTP)
	router.Route("/v1", func(r chi.Router) {
		r.Get("/qsos", qsoHandler.List)
		r.Post("/qsos", qsoHandler.Create)
		r.Get("/qsos/{id}", qsoHandler.Get)
		r.Patch("/qsos/{id}", qsoHandler.Update)
		r.Delete("/qsos/{id}", qsoHandler.Delete)
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("varc-api listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	fmt.Println("varc-api stopped")
}
