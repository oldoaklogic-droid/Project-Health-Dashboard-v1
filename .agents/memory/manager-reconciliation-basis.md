---
name: Manager reconciliation basis
description: Why M-100 portfolio totals and P-100 project detail intentionally use different reconciliation grains.
---

M-100 portfolio counts and total AR must stay tied to the canonical 133-active-root reconciliation checkpoint. P-100 project detail can use current BQE root/child rollups for operational metrics.

**Why:** Live BQE status and balances change after the checkpoint and include roots outside the approved external portfolio. Mixing current balances into the checkpoint scoreboard overstated AR and made the management total irreconcilable.

**How to apply:** Keep checkpoint-level portfolio totals on one reporting basis. Use current BQE facts for project-level drill-down, health evidence, invoices, time, and budgets; do not sum mixed checkpoint/live values into a portfolio headline.