import { eq } from "drizzle-orm";
import { bqeConnectionTable, db, type BqeConnection } from "@workspace/db";
import { logger } from "./logger";

const BQE_TOKEN_URL = "https://api-identity.bqecore.com/idp/connect/token";
const BQE_KEEPALIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60 * 1000;

type BqeTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  endpoint?: unknown;
  error?: unknown;
};

export type BqeAccessToken = {
  accessToken: string;
  apiBase: string;
};

export class BqeConnectionError extends Error {
  readonly statusCode: number;
  readonly requiresReauthorization: boolean;

  constructor(
    message: string,
    options: { statusCode?: number; requiresReauthorization?: boolean } = {},
  ) {
    super(message);
    this.name = "BqeConnectionError";
    this.statusCode = options.statusCode ?? 502;
    this.requiresReauthorization = options.requiresReauthorization ?? false;
  }
}

let cachedToken: {
  accessToken: string;
  apiBase: string;
  expiresAt: number;
} | null = null;
let refreshInFlight: Promise<BqeAccessToken> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let reauthorizationRequired = false;

function reauthorizationError(): BqeConnectionError {
  return new BqeConnectionError(
    "BQE authorization has expired or been revoked; re-authorization is required.",
    { statusCode: 503, requiresReauthorization: true },
  );
}

function requiredSecret(
  name: "BQE_CLIENT_ID" | "BQE_CLIENT_SECRET" | "BQE_REFRESH_TOKEN",
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new BqeConnectionError(
      `BQE is not configured: ${name} must be set in Replit Secrets.`,
      { statusCode: 503 },
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.error === "string" ? value.error : null;
}

function parseTokenResponse(body: string): BqeTokenResponse {
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  try {
    const endpoint = new URL(value);
    const path = endpoint.pathname.toLowerCase();
    return (
      endpoint.protocol === "https:" &&
      endpoint.hostname.toLowerCase() === "api.bqecore.com" &&
      (endpoint.port === "" || endpoint.port === "443") &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      endpoint.search === "" &&
      endpoint.hash === "" &&
      (path === "/api" || path.startsWith("/api/"))
    );
  } catch {
    return false;
  }
}

async function getConnectionRow(): Promise<BqeConnection> {
  const [existing] = await db
    .select()
    .from(bqeConnectionTable)
    .where(eq(bqeConnectionTable.id, 1));

  if (existing) {
    return existing;
  }

  const seedRefreshToken = requiredSecret("BQE_REFRESH_TOKEN");
  const [seeded] = await db
    .insert(bqeConnectionTable)
    .values({
      id: 1,
      refreshToken: seedRefreshToken,
      apiEndpoint: null,
    })
    .onConflictDoNothing()
    .returning();

  if (seeded) {
    logger.info("Initialized BQE connection from the configured refresh token");
    return seeded;
  }

  const [concurrent] = await db
    .select()
    .from(bqeConnectionTable)
    .where(eq(bqeConnectionTable.id, 1));
  if (!concurrent) {
    throw new BqeConnectionError("BQE connection state could not be initialized.", {
      statusCode: 503,
    });
  }
  return concurrent;
}

async function refreshBqeAccessToken(): Promise<BqeAccessToken> {
  await getConnectionRow();
  const clientId = requiredSecret("BQE_CLIENT_ID");
  const clientSecret = requiredSecret("BQE_CLIENT_SECRET");
  const refreshed = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(bqeConnectionTable)
      .where(eq(bqeConnectionTable.id, 1))
      .for("update");
    if (!connection) {
      throw new BqeConnectionError("BQE connection state is unavailable.", {
        statusCode: 503,
      });
    }

    let response: Response;
    try {
      response = await fetch(BQE_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: connection.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    } catch {
      logger.error("BQE token endpoint could not be reached");
      throw new BqeConnectionError("BQE token endpoint could not be reached.", {
        statusCode: 502,
      });
    }

    const body = await response.text();
    const payload = parseTokenResponse(body);
    const errorCode = readErrorCode(payload);

    if (errorCode === "invalid_grant" || body.includes("invalid_grant")) {
      reauthorizationRequired = true;
      logger.error("BQE rejected the refresh token; re-authorization is required");
      throw reauthorizationError();
    }

    if (!response.ok) {
      logger.error({ statusCode: response.status }, "BQE token refresh failed");
      throw new BqeConnectionError(
        `BQE token refresh failed with HTTP ${response.status}.`,
        { statusCode: 502 },
      );
    }

    const accessToken =
      typeof payload.access_token === "string" ? payload.access_token : null;
    const rotatedRefreshToken =
      typeof payload.refresh_token === "string" ? payload.refresh_token : null;
    const expiresIn =
      typeof payload.expires_in === "number"
        ? payload.expires_in
        : typeof payload.expires_in === "string"
          ? Number(payload.expires_in)
          : NaN;
    const apiBase = typeof payload.endpoint === "string" ? payload.endpoint.trim() : "";

    if (
      !accessToken ||
      !rotatedRefreshToken ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      !validEndpoint(apiBase)
    ) {
      logger.error("BQE token refresh returned an incomplete response");
      throw new BqeConnectionError("BQE token refresh returned an invalid response.", {
        statusCode: 502,
      });
    }

    // BQE invalidates connection.refreshToken when it rotates it. Keep the
    // database row locked and persist the replacement before returning any
    // value from this transaction.
    const [persisted] = await tx
      .update(bqeConnectionTable)
      .set({
        refreshToken: rotatedRefreshToken,
        apiEndpoint: apiBase,
        refreshedAt: new Date(),
      })
      .where(eq(bqeConnectionTable.id, connection.id))
      .returning({ id: bqeConnectionTable.id });
    if (!persisted) {
      throw new BqeConnectionError("The rotated BQE refresh token was not persisted.", {
        statusCode: 503,
      });
    }

    return { accessToken, apiBase, expiresIn };
  });

  cachedToken = {
    accessToken: refreshed.accessToken,
    apiBase: refreshed.apiBase,
    expiresAt: Date.now() + refreshed.expiresIn * 1000,
  };
  logger.info(
    { apiBase: refreshed.apiBase, expiresIn: refreshed.expiresIn },
    "BQE access token refreshed; rotated refresh token persisted",
  );
  return {
    accessToken: refreshed.accessToken,
    apiBase: refreshed.apiBase,
  };
}

export function getBqeAccessToken(): Promise<BqeAccessToken> {
  if (reauthorizationRequired) {
    return Promise.reject(reauthorizationError());
  }

  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now() + ACCESS_TOKEN_SAFETY_WINDOW_MS
  ) {
    return Promise.resolve({
      accessToken: cachedToken.accessToken,
      apiBase: cachedToken.apiBase,
    });
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshBqeAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function startBqeKeepalive(): void {
  if (keepaliveTimer) {
    return;
  }

  const runKeepalive = (): void => {
    void getBqeAccessToken()
      .then(() => {
        logger.info("BQE keepalive completed");
      })
      .catch((error: unknown) => {
        if (error instanceof BqeConnectionError && error.requiresReauthorization) {
          if (keepaliveTimer) {
            clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
          logger.error("BQE weekly keepalive stopped: re-authorization is required");
          return;
        }
        logger.error({ err: error }, "BQE weekly keepalive failed");
      });
  };

  keepaliveTimer = setInterval(runKeepalive, BQE_KEEPALIVE_INTERVAL_MS);
  keepaliveTimer.unref?.();
  logger.info("BQE weekly keepalive scheduled");
  runKeepalive();
}