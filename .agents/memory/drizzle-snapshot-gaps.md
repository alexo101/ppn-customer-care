---
name: Drizzle snapshot gaps
description: Notes on adding forward migrations while historical Drizzle snapshots are incomplete.
---

When adding database schema changes, preserve the existing migration chain. Incomplete Drizzle snapshots are not a reason to reset migration history or recreate existing tables.

**Why:** historical snapshot gaps can make migration generation unreliable.

**How to apply:** keep changes forward-only and preserve the existing journal when generated snapshots do not cover the full history.
