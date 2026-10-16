---
name: Development database migrations
description: Remember to apply development migrations when API code begins querying new database fields.
---

Apply pending development database migrations when a schema change is introduced, before restarting API services that depend on the new schema.

**Why:** the API's knowledge-article startup query failed because application code selected a new description column that existed in the project schema and migration files but not in the development database.

**How to apply:** after adding or changing a persisted field, verify the development database schema and apply the project's pending migration before testing the affected API path.
