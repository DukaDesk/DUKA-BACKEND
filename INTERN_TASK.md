# Intern Tasks — DUKA-BACKEND

> **Scope:** onboarding tasks for new backend interns only.
> This file is documentation. It is never built, linted, tested or deployed —
> it has zero effect on system operations.

---

## Rules for Interns

1. Read [`Reigner.md`](Reigner.md) first — it is the system's ground truth. Then [`README.md`](README.md).
2. Work on a **personal branch** (`intern/<your-name>/<task-id>`). Never push straight to `main`.
3. **No production access.** No Railway, no production database. Use local `docker compose up -d` for Postgres + Redis.
4. **Do not edit:** `Reigner.md`, `knowledge-base-version.md`, `docs/kb-backend-*.md`, `railway.json`, `Dockerfile`, `package.json` scripts (unless the task says so).
5. A task is **done only when** all four gates pass locally:
   ```bash
   npm run lint
   npm test
   npm run test:e2e
   npm run build
   ```
6. Append your results under **Completed** below — never rewrite past entries.

---

## Task Board

| ID | Task | Effort | Status | Intern | Week |
|----|------|--------|--------|--------|------|
| TASK-IN-001 | Overview smoke test suite | 1 week | Ready | — | — |

---

## TASK-IN-001 — Overview Smoke Test Suite (1 week)

**Goal:** Prove the main user journeys work end-to-end with happy-path smoke
tests. This is **overview coverage, not rigorous coverage** — no coverage
quotas, no error-path matrices, no performance work.

**Why:** `test/jest-e2e.json` exists but contains zero `*.e2e-spec.ts` files,
so `npm run test:e2e` currently runs nothing. The existing 7 unit suites
(`npm test`) all use mocked Prisma/Redis and never exercise the real HTTP
pipeline (guards → validation → controller → service → envelope).

### Day plan

| Day | Deliverable |
|-----|-------------|
| 1 | Read `Reigner.md` + `README.md`. Run `npm test` and `npm run lint`. `docker compose up -d`, `npm run prisma:migrate && npm run prisma:seed`, start the server, browse Swagger at `/api/docs`. |
| 2 | **Spec 1 — Health & envelope.** `GET /api/v1/health` → 200. A deliberately bad request returns `{ success: false, errors[] }`; a success returns `{ success, message, data, meta }`. |
| 3 | **Spec 2 — Auth flow.** Register → login → refresh token → call one guarded `/app/*` route with the access token. |
| 4 | **Spec 3 — Publish parity.** Publish a minimal manifest → `GET /api/v1/merchants/:id/definition` and `GET /api/v1/bff/mobile/tenant/:slug/manifest` return the **same version and checksum**. |
| 5 | **Specs 4–5 — Compatibility + discovery.** `GET /api/v1/compatibility` → 200 with contract id `dukadesk.published-app-runtime`. Unauthenticated `POST /api/v1/merchants/:id/publishing/preflight` → 401. `GET /api/v1/discovery/featured` returns `[]` for an unactivated tenant and includes `release {id, version, checksum}` for an activated one. |

### Files you will touch

- `test/*.e2e-spec.ts` (new files only)
- `Reigner.md` §10 **Personal Notes** — append a short results paragraph when finished

### Acceptance criteria

- [ ] 4–5 `*.e2e-spec.ts` files, one per spec above, all green via `npm run test:e2e`
- [ ] Tests exercise the real HTTP pipeline (supertest against the app), not mocked controllers
- [ ] `npm run lint`, `npm test`, `npm run build` still pass unchanged
- [ ] No production credentials, no Railway access, no changes to `src/**` production logic
- [ ] Results paragraph appended to `Reigner.md` §10

### Out of scope (do not do these)

- Coverage percentages or coverage gates
- Error/edge-case matrices beyond what each spec naturally needs
- CI wiring, Docker changes, deployment changes
- Fixing bugs you discover (report them in Completed instead)

### Verification

```bash
npm run lint        # 0 errors
npm test            # existing 58 tests still green
npm run test:e2e    # your new specs green
npm run build       # 0 issues
```

---

## Completed

*(appended entries only — do not edit existing ones)*
