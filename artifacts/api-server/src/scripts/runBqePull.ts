import { pool } from "@workspace/db";
import { runBqePhase1Pull } from "../lib/bqePull";

try {
  const result = await runBqePhase1Pull();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") {
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "BQE pull failed unexpectedly.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}