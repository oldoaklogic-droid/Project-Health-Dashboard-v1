---
name: BQE exhaustive-read constraints
description: Non-obvious API behavior for complete paginated exports and project-scoped payment discovery.
---

Complete BQE collection reads use one-based `page=N,100` pagination and must remain below the rolling request quota. The payment endpoint rejects `projectId` in `where`, despite payment models potentially carrying project linkage; exhaustive payment discovery therefore requires paging all complete payment models and filtering project IDs client-side, including nested fields.

**Why:** Zero-based paging repeated the first page, unpaced exhaustive reads received HTTP 429, and the server returned HTTP 400 for the documented-looking payment project predicate.

**How to apply:** Start collection paging at one, pace requests below the rolling quota with bounded 429 backoff, omit `fields` when complete models are required, and recursively inspect complete payments for target project IDs.