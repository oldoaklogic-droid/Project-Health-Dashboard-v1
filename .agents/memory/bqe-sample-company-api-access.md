---
name: BQE sample-company API access
description: Records BQE's confirmed limitation on API access for sample companies.
---

Do not create API sandbox connections against BQE sample companies; BQE confirmed that sample companies do not support API access.

**Why:** Attempts to authorize the Sample Company repeatedly returned `invalid_grant`, and BQE confirmed the platform limitation.

**How to apply:** Keep BQE API integrations production-only unless BQE provides a separately supported API test environment.