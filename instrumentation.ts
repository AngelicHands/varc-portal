export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runImportExportStartupVerification } = await import(
      "@/lib/import-export-auto-verify"
    );
    void runImportExportStartupVerification();
  }
}
