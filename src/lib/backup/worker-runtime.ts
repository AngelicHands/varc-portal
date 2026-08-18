import os from "node:os";
import { claimNextBackupJob } from "@/lib/backup/jobs";
import { failStaleRunningBackupJobs, processBackupJob } from "@/lib/backup/worker";
import { logServerError } from "@/lib/safe-error";

const globalForBackupWorker = globalThis as unknown as {
  backupWorkerStarted?: boolean;
};

const WORKER_ID = `${os.hostname()}:${process.pid}`;

async function runOnce() {
  await failStaleRunningBackupJobs();
  const job = await claimNextBackupJob(WORKER_ID);
  if (!job) return;
  await processBackupJob(job);
}

export function startBackupWorker() {
  if (process.env.BACKUP_WORKER_ENABLED !== "1") return;
  if (globalForBackupWorker.backupWorkerStarted) return;
  globalForBackupWorker.backupWorkerStarted = true;

  const pollMs = Math.max(3000, Number(process.env.BACKUP_WORKER_POLL_MS || 5000));

  const tick = async () => {
    try {
      await runOnce();
    } catch (error) {
      logServerError("backup-worker", error);
    } finally {
      setTimeout(() => {
        void tick();
      }, pollMs).unref();
    }
  };

  void tick();
}
