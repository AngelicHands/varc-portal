import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { importCallsignPayload } from "../src/lib/callsigns-import";
import type { ImportPayload } from "../src/lib/callsigns-parse";

async function main() {
  const force = process.argv.includes("--force");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const payload = JSON.parse(
    readFileSync(join(root, "data/varc-callsigns.json"), "utf8"),
  ) as ImportPayload;

  if (!payload.importKey || !Array.isArray(payload.events)) {
    throw new Error("Invalid callsign import payload");
  }

  await mongoose.connect(uri);

  try {
    const result = await importCallsignPayload(payload, { replace: force });
    console.log(
      `Imported ${result.events} license events, ${result.callsigns} callsigns, ${result.operators} operators.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already imported") && !force) {
      console.log(
        `Callsigns already imported (${payload.importKey}). Pass --force to replace.`,
      );
      return;
    }
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
