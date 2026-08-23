package worker

import (
	"context"
	"log"
	"time"
)

type TickFunc func(ctx context.Context)

func RunPollLoop(ctx context.Context, name string, interval time.Duration, tick TickFunc) {
	min := interval
	if min < time.Second {
		min = time.Second
	}
	log.Printf("[%s] poll loop started — interval=%s", name, min)

	run := func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[%s] panic: %v", name, r)
			}
		}()
		tick(ctx)
	}

	run()
	ticker := time.NewTicker(min)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Printf("[%s] poll loop stopped", name)
			return
		case <-ticker.C:
			run()
		}
	}
}
