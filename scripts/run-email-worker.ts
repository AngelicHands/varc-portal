/**
 * Standalone email worker process.
 * Usage: pnpm worker:email
 */
import { connectDb } from "@/lib/db";
import { claimNextEmailJob, failStaleRunningEmailJobs } from "@/lib/mail/jobs";
import { processEmailJob } from "@/lib/mail/worker";
import { logServerError } from "@/lib/safe-error";
import os from "node:os";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Math.max(
  2000,
  Number(process.env.EMAIL_WORKER_POLL_MS || 3000),
);

console.log(`[email-worker] starting — id=${WORKER_ID} poll=${POLL_MS}ms`);

async function tick() {
  try {
    await connectDb();
    await failStaleRunningEmailJobs();
    const job = await claimNextEmailJob(WORKER_ID);
    if (job) {
      console.log(
        `[email-worker] picked up job ${String(job._id)} kind=${job.kind}`,
      );
      await processEmailJob(job);
      console.log(`[email-worker] job ${String(job._id)} done`);
    }
  } catch (error) {
    logServerError("email-worker", error);
  } finally {
    setTimeout(() => void tick(), POLL_MS).unref();
  }
}

void tick();
