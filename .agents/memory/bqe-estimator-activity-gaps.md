---
name: BQE estimator activity gaps
description: How canonical estimator activity codes relate to the live BQE catalog and how live creation stays safe.
---

Canonical historical survey activity codes intentionally map to approved live BQE V-series activities. Keep that mapping explicit and maintained rather than changing estimator history labels or relying on fuzzy description matches. Dry runs may still use explicit unresolved placeholders and warnings so a no-write plan remains inspectable.

**Why:** BQE catalog codes can differ from historical estimator codes. A successful parent/child POST followed by an unresolved activity would leave partial objects, while fuzzy matching could silently select the wrong billable activity.

**How to apply:** Resolve mapped live codes for every positive-hours activity before any local or BQE live creation, retain the orchestration preflight before its first POST, and rerun the administrator readiness check whenever BQE activities or fingerprints change.