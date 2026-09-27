# Intern Tasks — DUKA-BACKEND

> **Scope:** onboarding tasks for new backend interns only.
> This file is documentation. It is never built, linted, tested or deployed —
> it has zero effect on system operations.

---

## Rules for Interns

1. Read `Reigner.md` first (provided to you — you do **not** have repository
   access). It is the system's ground truth: system overview, request flow,
   API surface, data model.
2. **You test against the live Swagger UI only** — no repo, no local setup,
   no code changes:
   ```
   https://duka-backend-production.up.railway.app/api/docs
   ```
   Use **Try it out** on each endpoint. The API reference you can also read
   offline: `docs/api-endpoints-reference.md` (shared with you).
3. **Get a token first.** `POST /api/v1/auth/register` → `POST /api/v1/auth/login`
   → copy the `accessToken` → click **Authorize** (padlock icon) → paste
   `Bearer <accessToken>`. All guarded endpoints then work in Swagger.
4. **Only touch your own data.** Register with your own email (use
   `intern+<yourname>@example.com` style), create your own tenant with a slug
   starting with `intern-`. Never modify tenants or data that are not yours.
5. **No Railway, no database, no terminal access.** Swagger UI is your only
   interface. If an endpoint is not visible in Swagger, skip it and note it.
6. **Bugs are findings, not fixes.** If something behaves incorrectly, record
   it in your report (expected vs actual + request/response). Do not try to
   "work around" the API.
7. Append your final report summary under **Completed** below — never rewrite
   past entries.

---

## Task Board

| ID | Task | Effort | Status | Intern | Week |
|----|------|--------|--------|--------|------|
| TASK-IN-001 | Swagger workflow walkthrough | 1 week | Ready | — | — |

---

## TASK-IN-001 — Swagger Workflow Walkthrough (1 week)

**Goal:** Manually exercise the platform's core user journeys through the
Swagger UI and produce a written test report. This is an **overview walkthrough,
not rigorous testing** — happy paths only, no edge-case matrices, no coverage
quotas, no code.

**Why:** You are new and have no repository access. Swagger exercises the real
running system, so you learn the actual request/response shapes (auth, envelope,
tenant lifecycle, publishing, public reads) exactly as clients see them.

### Day plan (all inside Swagger UI)

| Day | What to do | Endpoint sequence |
|-----|-----------|-------------------|
| 1 | **Orientation.** Read `Reigner.md`. Open `/api/docs`. Confirm public endpoints work with no token: health, compatibility, discovery. Note the response envelope shape (`{success, message, data, meta}` and error `{success:false, errors[]}`). | `GET /api/v1/health` → `GET /api/v1/compatibility` → `GET /api/v1/discovery/featured` |
| 2 | **Auth flow.** Register your intern account, log in, authorize in Swagger, then call a JWT-guarded route. Also verify refresh works. | `POST /api/v1/auth/register` → `POST /api/v1/auth/login` → **Authorize** → `POST /api/v1/auth/refresh` → one `/app/*` route |
| 3 | **Tenant + preflight.** Create your own tenant (`intern-<name>` slug). Then dry-run compatibility — first **without** a token (expect 401), then **with** a token and a minimal manifest (expect 200 with `compatible: true`). | `POST /api/v1/merchants` → `POST /api/v1/merchants/{id}/publishing/preflight` |
| 4 | **Publish + read-back parity.** Publish your minimal manifest with an `Idempotency-Key` header (retry once with the same key — same release must come back). Then compare both public read paths: same `version` **and** same `checksum`. | `POST /api/v1/merchants/{id}/publishing/publish` → `GET /api/v1/merchants/{id}/definition` → `GET /api/v1/bff/mobile/tenant/{slug}/manifest` |
| 5 | **Discovery + wrap-up.** Your tenant now has an active release — check it appears in discovery with its `release {id, version, checksum}` block. Finish your report. | `GET /api/v1/discovery/featured` → write report |

### Minimal manifest to use on days 3–4

Paste as the request body of `preflight` and `publish`
(`{"manifest": ...}` for preflight, `{"manifest": ..., "version": "1.0.1"}`
for publish):

```json
{
  "manifest": {
    "manifestVersion": "1.0.0",
    "identity": { "displayName": "Intern Test App", "appName": "intern-test" },
    "screens": {
      "home": {
        "screenId": "home",
        "components": [
          { "type": "heading", "props": { "text": "Hello from the intern" } }
        ]
      }
    },
    "navigation": { "root": "home", "tabs": [] },
    "version": "1.0.1"
  }
}
```

If `preflight` reports an incompatible component, adjust using the catalogs in
`GET /api/v1/compatibility` (`components` / `capabilities`) — that is part of
the learning.

### Deliverable — your report

Send back a markdown report containing, for **each** endpoint you touched:

- method + path
- request body / params used
- status code received
- response payload (trimmed to the meaningful fields)
- expected vs actual, and any discrepancy as a **Finding**

Plus a short summary: which journeys passed, which failed, open questions.

### Acceptance criteria

- [ ] Day 1–5 sequences all exercised in Swagger (record of each call in the report)
- [ ] Publish performed **twice with the same `Idempotency-Key`** → identical release returned
- [ ] Parity verified: `definition` and `bff/mobile manifest` show the same `version` and `checksum`
- [ ] Unauthenticated `preflight` confirmed as 401
- [ ] Report lists every finding with expected vs actual
- [ ] Only your own `intern-*` tenant was created/modified

### Out of scope (do not do these)

- Code, repository access, local setup, terminal commands
- Edge-case/negative testing beyond the explicit 401 check above
- Payment, notification, or admin endpoints (later tasks)
- Deleting other people's data or probing for security holes (report instead)

---

## Completed

*(appended entries only — do not edit existing ones)*
