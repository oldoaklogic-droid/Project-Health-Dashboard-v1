---
name: Orval Zod generation
description: Compatibility constraints for regenerating API clients and Zod validators in this workspace.
---

Generate the React client model types, but keep the Zod package focused on runtime validators rather than also generating and re-exporting a parallel model-type tree. Avoid OpenAPI `format: uuid` in this workspace's contract.

**Why:** The installed Orval/Zod combination emits duplicate operation-body exports when the Zod output also generates model types, and emits `zod.uuid()` even though the installed Zod version does not provide that top-level API.

**How to apply:** When extending the OpenAPI contract, use string schemas for UUID values and preserve the validator-only Zod output configuration before running code generation.