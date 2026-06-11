---
name: API contract drift (generated hooks vs hand-written server)
description: Why server handlers in this repo sometimes accept two body keys for one field, and how to avoid silent null-saves.
---

# Generated-client vs server body-key drift

New endpoints in this repo are wired with **direct `fetch`** (codegen is intentionally NOT run — it overwrites `lib/api-client-react`). But some older onboarding mutations still use **generated TanStack hooks** from the OpenAPI spec. The spec and the hand-written Express handlers can disagree on the request body key.

Concrete trap found: the onboarding **reject** flow uses the generated `useRejectOnboarding` hook, which sends `{ rejectionReason }` (the OpenAPI key), but the server handler read `{ notes }`. Result: `checkerNotes` silently saved as `null` — no error, the rejection reason just vanished.

**Why:** mixed client styles (generated hooks for old endpoints, direct fetch for new ones) means body-key contracts drift whenever the spec and server are edited independently, and there's no codegen step to catch it.

**How to apply:** when a mutation appears to "succeed" but a field saves as null/empty, suspect a body-key mismatch first. The pragmatic fix (without running codegen) is to make the server accept **both** keys, e.g. `const notes = body.notes ?? body.rejectionReason;`. Always verify persisted values with a GET or `psql`, not just the mutation's 200 response.
