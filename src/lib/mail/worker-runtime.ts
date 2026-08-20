import os from "node:os";
import { claimNextEmailJob, failStaleRunningEmailJobs } from "@/lib/mail/jobs";
import { processEmailJob } from "@/lib/mail/worker";
import { logServerError } from "@/lib/safe-error";

const globalForEmailWorker = globalThis as unknown as {
  emailWorkerStarted?: boolean;
};

const WORKER_ID = `${os.hostname()}:${process.pid}`;

async function runOnce() {
  await failStaleRunningEmailJobs();
  const job = await claimNextEmailJob(WORKER_ID);
  if (!job) return;
  await processEmailJob(job);
}

export function startEmailWorker() {
  if (process.env.EMAIL_WORKER_ENABLED !== "1") return;
  if (globalForEmailWorker.emailWorkerStarted) return;
  globalForEmailWorker.emailWorkerStarted = true;

  const pollMs = Math.max(2000, Number(process.env.EMAIL_WORKER_POLL_MS || 3000));

  const tick = async () => {
    try {
      await runOnce();
    } catch (error) {
      logServerError("email-worker", error);
    } finally {
      setTimeout(() => {
        void tick();
      }, pollMs).unref();
    }
  };

  void tick();
}
