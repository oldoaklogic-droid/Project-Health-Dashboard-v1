import app from "./app";
import { logger } from "./lib/logger";
import { startBqeKeepalive } from "./lib/bqe";
import { startNightlyHealthRefresh } from "./lib/projectHealth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port);
server.once("listening", () => {
  logger.info({ port }, "Server listening");
  startBqeKeepalive();
  startNightlyHealthRefresh();
});

server.once("error", (error: NodeJS.ErrnoException) => {
  logger.error(
    { code: error.code ?? "UNKNOWN", port },
    "Server failed to listen",
  );
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "Server shutting down");
  server.close((error) => {
    if (error) {
      logger.error(
        { code: (error as NodeJS.ErrnoException).code ?? "UNKNOWN" },
        "Server shutdown failed",
      );
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
