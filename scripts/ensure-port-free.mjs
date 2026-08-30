#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { realpathSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const service = process.argv[2];
const port = Number(process.env.PORT);

const serviceRules = {
  api: {
    label: "the API server",
    command: /\/dist\/index\.mjs(?:\s|$)/,
  },
  web: {
    label: "the dashboard",
    command: /\/vite\/bin\/vite\.js(?:\s|$)/,
  },
};

const rule = serviceRules[service];
if (!rule) {
  throw new Error("Usage: ensure-port-free.mjs <api|web>");
}

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(
    "PORT must be a valid TCP port before starting a managed service.",
  );
}

const workingDirectory = realpathSync(process.cwd());

function listenerPids() {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return [...new Set(output.split(/\s+/).filter(Boolean).map(Number))];
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 1
    ) {
      return [];
    }
    throw new Error(
      `Could not inspect TCP port ${port} before starting ${rule.label}.`,
    );
  }
}

function processDetails(pid) {
  try {
    const cwd = realpathSync(`/proc/${pid}/cwd`);
    const command = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .replaceAll("\0", " ")
      .trim();
    return { cwd, command };
  } catch {
    return null;
  }
}

function isManagedStaleProcess(pid) {
  if (pid === process.pid) return false;
  const details = processDetails(pid);
  return Boolean(
    details &&
    details.cwd === workingDirectory &&
    rule.command.test(details.command),
  );
}

function managedPids(pids) {
  const unknown = pids.filter((pid) => !isManagedStaleProcess(pid));
  if (unknown.length > 0) {
    throw new Error(
      `TCP port ${port} is occupied by an unrelated process; refusing to terminate it.`,
    );
  }
  return pids;
}

async function freePort() {
  const initialPids = managedPids(listenerPids());
  if (initialPids.length === 0) return;

  for (const pid of initialPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ESRCH"
      )) {
        throw new Error(`Could not stop the stale ${rule.label} process.`);
      }
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const remaining = managedPids(listenerPids());
    if (remaining.length === 0) return;

    if (attempt === 20) {
      for (const pid of remaining) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ESRCH"
          )) {
            throw new Error(`Could not release the stale ${rule.label} port.`);
          }
        }
      }
    }

    await delay(100);
  }

  throw new Error(
    `The stale ${rule.label} process did not release TCP port ${port}.`,
  );
}

await freePort();
