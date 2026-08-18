/**
 * Standalone backup worker process.
 * Usage: pnpm worker:backup
 * This process only processes backup/restore jobs — it does not serve HTTP.
 */
import { connectDb } from "@/lib/db";
import { logServerError } from "@/lib/safe-error";
import {
  claimNextBackupJob,
  listBackupJobs,
} from "@/lib/backup/jobs";
import {
  failStaleRunningBackupJobs,
  processBackupJob,
} from "@/lib/backup/worker";
import os from "node:os";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Math.max(
  3000,
  Number(process.env.BACKUP_WORKER_POLL_MS || 5000),
);

console.log(`[backup-worker] starting — id=${WORKER_ID} poll=${POLL_MS}ms`);

async function tick() {
  try {
    await connectDb();
    await failStaleRunningBackupJobs();
    const job = await claimNextBackupJob(WORKER_ID);
    if (job) {
      console.log(
        `[backup-worker] picked up job ${String(job._id)} kind=${job.kind}`,
      );
      await processBackupJob(job);
      console.log(`[backup-worker] job ${String(job._id)} done`);
    }
  } catch (error) {
    logServerError("backup-worker", error);
  } finally {
    setTimeout(() => void tick(), POLL_MS).unref();
  }
}

void tick();
