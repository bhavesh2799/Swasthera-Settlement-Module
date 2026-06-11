---
name: Onboarding response field whitelist
description: Why new onboarding columns can persist in DB but return null in API responses
---

# Onboarding API responses use an explicit field whitelist

The onboardings routes serialize via a `mapOnboarding(row)` helper that returns an
**explicit object literal** of fields (not `...row`). Several other routes/lists do
the same (e.g. the list handler maps `rows.map(r => ({...}))`).

**Rule:** When you add a column to `onboardingsTable` (or any table whose routes use
a manual mapper), you must update THREE places, not two:
1. the Drizzle schema (`lib/db/src/schema/*.ts`)
2. the route insert/update `.values({...})`
3. the response mapper (`mapOnboarding` and any `rows.map(...)` projections)

**Why:** Skipping #3 produces a silent bug — the value persists correctly in
Postgres (verify with `psql`), the `.returning()` row has it, but the JSON the
client sees is `null` because the mapper never copied it. This looks like a stale
server build but is actually a whitelist omission. Confirmed by querying the row
directly: DB had the value while the API returned null.

**Also:** the api-server runs as a pre-built esbuild bundle, not a tsx watcher, so
source edits are NOT hot-reloaded — you must restart the API Server workflow for any
backend change to take effect. After editing `lib/db` schema, rebuild the lib's dist
(libs typecheck) BEFORE restarting, or the bundle links against stale declarations.
