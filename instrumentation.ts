export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupWorker } = await import(
      "@/lib/backup/worker-runtime"
    );
    startBackupWorker();

    const { startEmailWorker } = await import("@/lib/mail/worker-runtime");
    startEmailWorker();

    const { runImportExportStartupVerification } = await import(
      "@/lib/import-export-auto-verify"
    );
    void runImportExportStartupVerification();
  }
}
