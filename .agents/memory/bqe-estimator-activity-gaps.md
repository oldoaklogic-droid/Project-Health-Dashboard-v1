---
name: BQE estimator activity gaps
description: Why estimator dry runs can contain unresolved activity placeholders and what must happen before live BQE project creation.
---

The live BQE activity catalog did not resolve these canonical estimator codes on 2026-09-01: S-105, S-106, S-104, S-400, S-302, S-616, S-617, S-605, S-604, S-503, and S-506. Dry runs may use explicit unresolved placeholders and warnings so the full no-write plan remains inspectable. Live mode must stay strict and preflight every required lookup before the first object POST.

**Why:** A successful parent/child project POST followed by an unresolved activity would leave partial BQE objects. Preflight prevents this, while dry-run warnings make the catalog mismatch visible without creating anything.

**How to apply:** Before enabling or testing live creation, reconcile canonical estimator codes to current BQE activities (or establish approved mappings). Do not weaken live lookup failures or reuse dry-run placeholders in live payloads.