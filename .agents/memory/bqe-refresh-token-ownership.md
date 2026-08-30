---
name: BQE refresh-token ownership
description: Operational rule for BQE's one-time rotating refresh token and recovery boundaries.
---

After the first successful refresh, PostgreSQL is the source of truth for the current BQE refresh token. `BQE_REFRESH_TOKEN` in Replit Secrets is bootstrap-only and must not overwrite an existing database row.

**Why:** BQE invalidates each refresh token when issuing its replacement. Reusing the original Secrets value after rotation will produce `invalid_grant` and require re-authorization.

**How to apply:** Preserve the BQE connection row across restarts and deployments. Seed from Secrets only when the table is empty, serialize refreshes through the database, and persist each replacement before using the associated access token.