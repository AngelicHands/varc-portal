package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/varc-vietnam/varc-portal/apps/api/internal/cache"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/config"
	appmongo "github.com/varc-vietnam/varc-portal/apps/api/internal/mongo"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/worker"
	"github.com/varc-vietnam/varc-portal/apps/api/internal/worker/backup"
	emailworker "github.com/varc-vietnam/varc-portal/apps/api/internal/worker/email"
	importexportworker "github.com/varc-vietnam/varc-portal/apps/api/internal/worker/importexport"
)

func main() {
	log.SetPrefix("[varc-worker] ")
	log.SetFlags(log.LstdFlags)

	cfg := config.LoadWorker()
	if cfg.MongoURI == "" {
		log.Fatal("MONGODB_URI is required")
	}
	workerID := cfg.WorkerID
	log.Printf("starting — id=%s email_poll=%s backup_poll=%s import_export_poll=%s", workerID, cfg.EmailPoll, cfg.BackupPoll, cfg.ImportExportPoll)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mongoClient, err := appmongo.Connect(ctx, cfg.MongoURI)
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	defer func() {
		shutdownCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = mongoClient.Close(shutdownCtx)
	}()

	valkeyClient, err := cache.Connect(ctx, cfg.ValkeyURL, cfg.ValkeyPassword)
	if err != nil {
		if cfg.ValkeyURL == "" {
			log.Printf("valkey: not configured; mail rate limits and CMS cache invalidation degraded")
		} else {
			log.Printf("valkey unavailable: %v; mail rate limits and CMS cache invalidation degraded", err)
		}
		valkeyClient = &cache.Valkey{}
	} else {
		log.Printf("valkey: connected")
	}
	defer valkeyClient.Close()

	db := mongoClient.DB()
	emailProc := &emailworker.Processor{DB: db, Valkey: valkeyClient, Config: cfg}
	backupStore := &backup.JobStore{DB: db}
	backupProc := backup.NewProcessor(backupStore, cfg, valkeyClient)
	importExportStore := &importexportworker.JobStore{DB: db}
	importExportProc := importexportworker.NewProcessor(importExportStore, cfg.PortalInternalURL, cfg.WorkerInternalSecret)

	if cfg.WorkerInternalSecret == "" {
		log.Printf("import-export-worker: WORKER_INTERNAL_SECRET/AUTH_SECRET unset; import/export jobs disabled")
	} else {
		log.Printf("import-export-worker: portal=%s", cfg.PortalInternalURL)
	}

	go worker.RunPollLoop(ctx, "email-worker", cfg.EmailPoll, func(loopCtx context.Context) {
		emailProc.FailStale(loopCtx)
		job, err := emailProc.ClaimNext(loopCtx, workerID)
		if err != nil {
			log.Printf("[email-worker] claim error: %v", err)
			return
		}
		if job == nil {
			return
		}
		log.Printf("[email-worker] picked up job %s kind=%s", job.ID.Hex(), job.Kind)
		emailProc.Process(loopCtx, job)
		log.Printf("[email-worker] job %s done", job.ID.Hex())
	})

	go worker.RunPollLoop(ctx, "backup-worker", cfg.BackupPoll, func(loopCtx context.Context) {
		backupStore.FailStale(loopCtx, 6*time.Hour)
		job, err := backupStore.ClaimNext(loopCtx, workerID)
		if err != nil {
			log.Printf("[backup-worker] claim error: %v", err)
			return
		}
		if job == nil {
			return
		}
		log.Printf("[backup-worker] picked up job %s kind=%s", job.ID.Hex(), job.Kind)
		backupProc.Process(loopCtx, job)
		log.Printf("[backup-worker] job %s done", job.ID.Hex())
	})

	if cfg.WorkerInternalSecret != "" {
		go worker.RunPollLoop(ctx, "import-export-worker", cfg.ImportExportPoll, func(loopCtx context.Context) {
			importExportStore.FailStale(loopCtx, 2*time.Hour)
			importExportProc.ProcessDueSchedules(loopCtx)
			job, err := importExportStore.ClaimNext(loopCtx, workerID)
			if err != nil {
				log.Printf("[import-export-worker] claim error: %v", err)
				return
			}
			if job == nil {
				return
			}
			log.Printf("[import-export-worker] picked up job %s kind=%s trigger=%s", job.ID.Hex(), job.Kind, job.Trigger)
			importExportProc.Process(loopCtx, job)
			log.Printf("[import-export-worker] job %s done", job.ID.Hex())
		})
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Printf("shutting down")
	cancel()
	time.Sleep(200 * time.Millisecond)
	log.Printf("stopped")
}
