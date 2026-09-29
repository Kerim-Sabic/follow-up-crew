import { runWorkerUnit } from "./creator-service.server";
import { runBulkUnit } from "./bulk-jobs.server";
import { creatorDb } from "./creator-db.server";
let stop = false;
process.on("SIGINT", () => {
  stop = true;
});
process.on("SIGTERM", () => {
  stop = true;
});
while (!stop) {
  try {
    const worked = (await runBulkUnit()) || (await runWorkerUnit());
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1500));
  } catch {
    console.error(
      "Mission worker unavailable; verify database configuration and migration status.",
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
await creatorDb().end({ timeout: 5 });
