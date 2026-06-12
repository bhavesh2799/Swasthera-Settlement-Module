---
name: Role header only on fetch, not anchor downloads
description: Why GET/download API routes in this app stay unguarded (no authorize() RBAC).
---

# Role header reaches fetch() but not anchor navigations

The frontend RBAC simulation injects the active role via an `X-Role` header using a
global `fetch` interceptor (`artifacts/swasthera/src/lib/apiInterceptor.ts`). It only
patches `window.fetch`.

**Rule:** Browser-initiated downloads via `<a href="/api/...">` (PDF, ZIP, CSV) and
plain navigations do NOT go through the patched fetch, so they carry NO `X-Role`
header. Any route reached that way must stay open (no `authorize()` middleware) or it
returns 403 for everyone.

**Why:** This matches the established codebase convention — every GET/list and
download route (transactions invoice download, settlement SoC / invoice-pdf, all list
endpoints) is intentionally unguarded; only mutating POSTs use `authorize()`. A code
review flagged the open invoice endpoints as an RBAC gap; it was declined for this
consistency + downloads-break reason.

**How to apply:** When adding a download or GET endpoint that the UI hits via an
anchor, do not add `authorize()`. If a GET truly needs RBAC, the client must fetch the
bytes via `fetch` (which carries the header) and trigger the download from a Blob,
not via a bare anchor href.
