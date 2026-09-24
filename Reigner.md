# Reigner.md

> Personal reference file for DUKA-BACKEND.
> This is my up-to-date, personal summary of what we have built and what the system is about.

---

## 1. System Overview

**DUKA-BACKEND** is a multi-tenant **Backend-as-a-Platform (BaaP)** that powers the DUKADESK ecosystem.

The core idea: businesses register once, build a branded app configuration (pages, sections, components, theme, commerce, booking, forms, payments), and publish updates that are delivered instantly to customers through a **single React Native runtime** using **Server-Driven UI (SDUI)** — no separate app store releases needed.

The backend is the single source of truth: it stores tenant configs, compiles them into an app definition JSON (the SDUI contract), serves public/authenticated APIs, and handles all domain logic.

---

## 2. What It Does

Plain-language breakdown of the platform's capabilities:

### Platform Core
- **Tenant Lifecycle** — businesses create tenants, get approved, subscribe to plans, and manage runtime config (languages, currency, timezone, region, offline policy).
- **Identity & Access (IAM)** — user registration/login (JWT + refresh rotation), OTP verification, Google/Apple OAuth, password recovery with policy enforcement, device management, consent tracking.
- **RBAC** — roles and permissions (4 seed roles, 20 permissions) enforced via guards and decorators.
- **Publishing Pipeline** — validates drafts or client-submitted PublishedApp 1.0.0 manifests (`ManifestValidator`), allocates version/checksum, activates one immutable release in a transaction (`tenant.activeReleaseId`), honors `Idempotency-Key`, supports rollback with owner/manager authz, and retains editable drafts after publish.
- **Canonical public reader** — shared `ActiveReleaseService` used by both Renderer definition and Mobile BFF manifest so they always return the same active production snapshot + `release` receipt (id/version/checksum).

### Business Engines
- **Builder & Renderer (SDUI)** — pages → sections → components hierarchy, navigation, theme, and the compiled app definition endpoint consumed by the mobile runtime.
- **Commerce** — categories, products with variants, inventory reservations, cart/checkout, orders with validated status transitions, coupons, tax rules, fulfillments.
- **Booking & Scheduling** — services, staff, resources, schedules, availability engine, bookings with a 7-state workflow, cancellation policies, reminders, waiting lists.
- **Forms & Workflow** — versioned forms with validation, submissions, and approval workflows.
- **Payments** — provider adapters (Paystack, Flutterwave, Stripe), payment intents, verification, refunds, settlements, provider health, webhooks.
- **Notifications** — templates, push/email/SMS/in-app via adapters, campaigns, segmentation, click tracking, preferences, device tokens.
- **Media / DAM** — uploads with sharp image optimization (WebP, variant presets), folders (find-or-create + UUID validation for `folderId`), versions, CDN URLs (StorageService return values retained), collections, shares, storage providers; original not deleted when keys collide (`.webp` self-delete guard).

### Platform Enhancements
- **Integrations** — connector framework (SendGrid, Google Calendar).
- **Analytics & BI** — event tracking, dashboards, saved reports.
- **Search & Discovery** — full-text index, synonyms, autocomplete, facets, popular/no-result analytics.
- **AI Platform** — OpenAI / Anthropic / Mock providers, prompts, completions, embeddings.
- **Platform Administration** — settings, announcements, feature flags, plans, quotas, subscriptions, stats.
- **Infrastructure & DevOps** — deployments, environments, health checks, backups.
- **Security & Compliance** — policies, API keys, security events, consent audits.
- **Developer Platform** — developer apps, webhook endpoints, event logs, rate-limit status.
- **Marketplace & Plugins** — listings, plugin installation/toggling/config.
- **Discovery / QR / Admin** — featured/search/nearby discovery, QR deep links, admin approval/suspension.
- **BFF Backends** — mobile, tenant dashboard, business dashboard, and website-facing aggregated endpoints.

### Data & Lifecycle
- Profile deactivation/deletion with 30-day soft delete and auto-cleanup (GDPR / Apple / Google friendly).

---

## 3. Architecture Explained

**Pattern:** Modular monolith — a single NestJS app with 29+ feature modules and 8 global modules. Decoupled for future extraction to microservices.

**Request flow:**

```
ThrottlerGuard
  → CorrelationId middleware
  → TenantResolver middleware (AsyncLocalStorage context from header/slug/subdomain/param)
  → JwtAuthGuard (Passport JWT)
  → RbacGuard (roles/permissions)
  → ValidationPipe (class-validator)
  → Controller → Service → EventBus → Prisma/PostgreSQL
```

**Key mechanics:**
- **Tenant isolation** — `TenantContextService` (AsyncLocalStorage) resolves and carries tenant context through the request; scoped queries are tenant-aware.
- **Response envelope** — `TransformInterceptor` wraps success as `{success, message, data, meta}`; `HttpExceptionFilter` wraps errors as `{success:false, errors[]}`.
- **Event bus** — in-process pub/sub emitting domain events (`ReleasePublished`, `PaymentCompleted`, `BookingCreated`, `OrderCreated`, `FormSubmitted`).
- **Provider adapters** — payments, notifications, integrations, and AI all use interface-based adapters so providers can be swapped; most have `log` or mock fallbacks for development.
- **Redis** — OTP, recovery tokens, manifest/theme caching, and gateway rate limiting (with in-memory mock fallback when Redis is unavailable).
- **Queues** — Bull queues (publishing, notifications, assets, webhooks, analytics) for async work.

---

## 4. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (Node.js + TypeScript 6, SWC builder) |
| ORM / DB | Prisma 6.19 + PostgreSQL 16 |
| Cache / Pub-sub | Redis 7 (ioredis, in-memory mock fallback) |
| Auth | JWT (access + refresh rotation), bcrypt, Google OAuth + Apple Sign-In |
| Queue | Bull (5 queues) |
| Image processing | sharp (WebP, 5 variant presets) |
| Validation / Docs | class-validator + class-transformer; Swagger/OpenAPI |
| Logging | nestjs-pino (structured, correlation IDs) |
| Testing | Jest + ts-jest + Supertest (5 unit suites, 38 tests) |
| Deployment | Docker (2-stage build) + Railway |

---

## 5. Data Model

`prisma/schema.prisma` — **~2073 lines, ~75 models, 10 enums** across these domains:

- **IAM** — User (with soft-delete fields), Profile, RefreshToken, Device, PasswordHistory, Consent, ConsentScope
- **RBAC** — Role, Permission, RolePermission, UserRole
- **Tenant** — Tenant, TenantUser, TenantConfig, Plan, Subscription, TenantDomain
- **Builder/SDUI** — Template (with version), Page → Section → Component, Navigation, Theme + ThemeVersion, DraftPage → DraftSection → DraftComponent
- **Publishing** — Draft, Release (versioned + checksummed), ValidationReport
- **DAM** — Media (with templateId for shared asset pool), AssetFolder, AssetVersion
- **Commerce** — Category, Product, ProductVariant, ProductImage, Cart/CartItem, Order/OrderItem/OrderStatusHistory, Coupon, Fulfillment, TaxRule, InventoryReservation
- **Booking** — BookingService, StaffMember, BookingResource, Schedule, BookingLocation, CancellationPolicy, BookingReminder, Booking, BookingHistory, WaitingListEntry
- **Forms** — Form, FormField, FormSubmission, FormApproval, FormWorkflow
- **Payments** — PaymentProvider, TenantPaymentAccount, PaymentIntent, PaymentTransaction, WebhookEvent, Settlement, FinancialEvent
- **Notifications** — NotificationTemplate, NotificationEvent, NotificationPreference, DeviceToken, DeliveryResult
- **Phase 3b/3c** — IntegrationConnector, OAuthToken, WebhookOutbox, SyncJob; AnalyticsEvent, Dashboard, SavedReport; SearchIndex, SearchQuery, SearchSynonym; AIProvider, AIPrompt, AICompletion, AIEmbedding; PlatformSetting, SystemAnnouncement, FeatureFlag, ApiQuota; Deployment, Environment, HealthCheck, Backup; SecurityPolicy, ApiKey, SecurityEvent, ConsentAudit; DeveloperApp, WebhookEndpoint, WebhookEventLog; MarketplaceListing, PluginInstallation; AssetCollection, AssetShare, StorageProvider; AuditLog, Notification

**Seed data:** 4 roles, 20 permissions, 3 plans (Starter/Business/Enterprise), 3 payment providers (Flutterwave/Paystack/Stripe), 3 templates (Modern Store, Restaurant, Clinic), sample tenant "Acme Store".

---

## 6. API Surface

- **Global prefix:** `/api` with URI versioning → `/api/v1/...`
- **Surface:** ~434 endpoints across 32 modules
- **Architecture:** Three-tier (Website / App / Mobile)
- **Docs:** Swagger at `/api/docs`
- **Health:** `GET /api/v1/health` (public)

### Three-Tier Endpoint Model

| Tier | Path Prefix | Audience | Auth |
|------|-------------|----------|------|
| **Website (Platform)** | `/admin/*`, `/auth/*`, `/discovery/*`, `/templates/*`, `/bff/website/*` | Platform operators | JWT / Public |
| **App (Tenant Self-Service)** | `/app/*` | Tenant owners/managers | JWT + `@CurrentUser` (auto-resolves tenant) |
| **Mobile/Consumer** | `/merchants/:merchantId/*` | End users (public) | `@Public()` or JWT |

**Controller Pattern:**
- `*AppController` — JWT + `@CurrentUser`, auto-resolves tenantId via `TenantResolverService`
- `*PublicController` — `@Public()` with explicit `:merchantId` param

The full endpoint catalog is maintained in `docs/api-endpoints-reference.md`.

---

## 7. Running the System

```bash
# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Install + generate client
npm install
npm run prisma:generate

# Migrate + seed
npm run prisma:migrate
npm run prisma:seed

# Dev server (hot reload) on https://duka-backend-production.up.railway.app
npm run start:dev
```

Other scripts: `npm run build`, `npm run start:prod`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run prisma:studio`, `npm run docker:down`.

**Deployment (Railway):** Docker build; pre-deploy runs `prisma db push` + seed; healthcheck `/api/v1/health`.

---

## 8. Build Progress

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Infrastructure (EventBus, Redis, Queue, RBAC, Logging, Health) | Complete |
| 1 | Platform (IAM, Tenants, Gateway/BFF, Publishing, DAM) | Complete |
| 2 | Domain engines (Commerce, Booking, Forms, Payments, Notifications) | Complete |
| 3a | Enhancement (Theme, Builder, Commerce, Booking, Notifications, Payments) | Complete |
| 3b/3c | Integrations, Analytics, Search, AI, Platform Admin, Infra, Security, Developer | Complete |
| 4 | Marketplace, Asset Platform, Notification Adapters, Campaign Segmentation | Complete |
| v0.2 | Three-tier API architecture (Website/App/Mobile split) | Complete |
| v0.2 | App/Public controller split for all 13 tenant modules | Complete |
| v0.2 | TASK-0024: Publish permission fix (owner/manager roles) | Complete |
| v0.2.1 | TASK-0025: Customizable Dashboard (widget data resolution, DTOs, registry) | Complete |
| v0.3 | Draft/Published Split — Private drafts (DraftPage/DraftSection/DraftComponent), immutable releases, manifest-first reads | Complete |
| v0.3 | Template Versioning + Shared Asset Pool — Template.version, Media.templateId, branding preservation, media copy on apply | Complete |
| v0.3 | Media Hardening — MIME whitelist (15 types), 10MB limit, Swagger DTOs, asset validation on publish | Complete |
| v0.3 | Data Contracts — Binding shapes per vertical documented | Complete |
| v0.3.1 | P0 Admin Fixes — Status enum validation, Number() pagination, POST users approve/reject, DELETE merchants soft-delete (30-day), analytics optional tenantId via TenantResolver | Complete |
| v0.3.2 | P0 Admin Fixes v2 — UserStatus +pending/+rejected, case-insensitive filter, tenant alias, body+query invite, Swagger decorators | Complete |
| v0.3.3 | P0 tenantUsers Fix — Fixed tenantUsers→tenants (correct Prisma relation), dropped invalid role include (enum), added admin maintenance/policies stubs | Complete |
| v0.3.4 | Merchant reject + stats — TenantStatus +rejected, POST /admin/merchants/:id/reject with rejectionReason, GET /admin/merchants/stats by status | Complete |
| v0.3.5 | Published logo/release mismatch — S3 StorageService, manifest body publish, body limits, publish creates new Release directly | Complete |
| v0.3.6 | Publishing defect fixes — screen format normalization, duplicate release prevention, rollback cache invalidation, WebP self-delete guard | Complete |
| v0.3.7 | Published app delivery B1–B6 — ManifestValidator (1.0.0 object screens), atomic release activation + `activeReleaseId`, ActiveReleaseService shared by renderer/BFF, Idempotency-Key, owner/manager authz on publish/rollback, media folderId resolve + StorageService URLs, default merchant app seed, ApiQuotaGuard, 5 unit suites (38 tests) | Complete (code) / live verify pending |

---

## 9. Known Gaps / Risks (Honest Notes)

Kept here so this file stays accurate:

- **Unit tests only (38)** — five Jest suites cover manifest validation, publishing activation/idempotency/authz, active-release parity, media folderId/storage, and press-action round-trip. Full HTTP e2e / live B8 evidence is still open. Coverage of other modules remains the biggest gap.
- **Provider adapters are simulated** — payments use placeholder keys, notification adapters default to `log`, SendGrid/GoogleCalendar connectors are stubs, AI Mock is manually wired. Real integrations are scaffolded but not production-tested.
- **Secret handling is casual** — `.env` is committed in the repo, `JWT_SECRET` has a `'super-secret'` fallback, and the seed hash's plaintext password (`Password123!`) is documented. Needs hardening before real deployment.
- **Rate limiting partially wired** — global `ThrottlerGuard` + new `ApiQuotaGuard` (platform `checkQuota`/`incrementQuota` on `/app/*` when tenant context exists). Quota defaults and operational docs still need hardening; Redis outage path fails open by design.
- **Active-release migration not applied** — `prisma/migrations/20260924000000_add_active_release` is written and ready; run `npx prisma migrate deploy` (or `migrate dev`) before relying on the column in production. Runtime fallback backfills pre-migration rows.
- **SMS adapters are log-only** — Twilio, Termii, Africa's Talking just log and return success (no real HTTP calls).
- **Email SES/SMTP adapters are log-only** — `sendViaSes()` and `sendViaSmtp()` just log and return success.
- **APNS push is a stub** — Logs and returns success without actual Apple Push delivery.
- **Discovery nearby is simplified** — `getNearby()` accepts lat/lng but does not perform actual geospatial queries.
- **No RBAC guard middleware** — `RbacService` exists but only used in `UsersService`; no global guard enforced.
- **No audit logging middleware** — `AuditLog` model exists but no auto-recording.
- **Template manifest validation incomplete** — Validates pages exist, but component types are not validated against the component registry.
- **Swagger incomplete for Builder/Publishing** — Media has full `@ApiProperty()` DTOs; Builder and Publishing have `@ApiOperation` but not full DTO validation decorators.
- **Docs drift** — README references `*-enhanced/` module folders that don't exist (functionality was folded into parent modules); schema uses `Plan` where docs say `SubscriptionPlan`; `dist/` is committed.

**Completion: ~91/100** — All 32 modules implemented with real business logic and Prisma queries. 85+ models. Three-tier architecture complete. Draft/published split, template versioning, media hardening, P0 admin fixes done. Main gaps: 0% test coverage, rate limiting not wired, adapter stubs.

---

## 10. Personal Notes

> Placeholder for my own ongoing notes — observations, decisions, TODOs, and anything I learn as we keep building.







## 11. API Analysis (Condensed)

**Framework & Structure** — NestJS 11 modular monolith, 33 controllers, ~447 endpoints across 32+ domains. Three-tier architecture: Website (platform), App (tenant self-service), Mobile (consumer). Global prefix `/api` + URI versioning `v1`. Swagger UI at `/api/docs`.

**Endpoint Statistics**
- Total endpoints: ~447
- Public (no auth): ~35 | Authenticated (JWT): ~380 | Admin-only: ~13
- App (self-service): ~120 | Mobile/Consumer: ~80 | Platform/Admin: ~50 | BFF: ~20
- Involving payments: 12 | Background jobs: 27 | External services: 18

**Major API Flows**

*Authentication*: `POST /auth/login` → access/refresh tokens → `JwtAuthGuard` on subsequent requests. Device management via `/devices/...`. Refresh rotation 7d/15m. Google/Apple OAuth supported.

*Three-Tier Flow*: Mobile user hits `GET /merchants/:merchantId/products` (public). Tenant owner hits `POST /app/commerce/products` (auto-resolves tenant from JWT membership). Admin hits `POST /admin/merchants` (platform-level).

*SDUI*: Mobile app fetches manifest from `Release.manifest` (cached 5 min in Redis). Contains `manifestVersion`, `identity`, theme, navigation, plan features, and full SDUI hierarchy (pages→sections→components). Falls back to live DB if no release exists. Public endpoint; cache TTL hard-coded 300s.

*Draft/Published Split*: Builder writes to `DraftPage`/`DraftSection`/`DraftComponent` tables. Publishing compiles drafts → `Release.manifest` → clears drafts. Mobile and definition endpoints read from `Release.manifest` only. `GET /definition?version=X.Y.Z` pins a specific release.

*Commerce*: Product catalogue `GET /merchants/:merchantId/products` (public) → add to cart `POST /cart/items` → checkout `POST /cart/:id/checkout` → order creation with status transitions → payment `POST /app/payments/initialize` → provider verify → order status updates.

*Booking*: Availability `GET /merchants/:merchantId/booking/availability` → public booking `POST /merchants/:merchantId/booking` → status updates → reminders via background job.

*Dashboard (TASK-0025)*: `POST /app/analytics/dashboards` → `POST /app/analytics/dashboards/:id/widgets` (10 metric types) → `GET /app/analytics/dashboards/:id/data` (resolves all widget data live). Widget types: metric, chart, table, list.

**API Findings (Key Points)**
- ✅ Three-tier architecture (Website/App/Mobile) fully implemented
- ✅ Uniform envelope via TransformInterceptor, consistent guard/decorator patterns
- ✅ Provider adapter pattern (payments/notifications/AI) enables swapping implementations
- ✅ Redis with in-memory mock fallback for dev-friendliness
- ✅ BFF business dashboard wired to real service (was returning zeros)
- ✅ Dashboard widget data resolution with 10 supported metrics
- ⚠️ `JWT_SECRET` fallback `'super-secret'` in code → rotate before production
- ⚠️ Rate limiting global only → per-endpoint overrides recommended
- ⚠️ Provider adapters are simulated (log-only SMS, SES, SMTP, APNS)

**Quick Command** — Retrieve OpenAPI JSON from running backend:
```bash
curl https://duka-backend-production.up.railway.app/api/docs/swagger.json > openapi.json
```

**Personal Notes** — Continue adding observations, decisions, and TODOs as development progresses.

---

## 12. Website & Mobile Endpoints — A Tale of Two UIs

The DUKA-BACKEND serves two distinct audiences through its BFF (Backend-for-Frontend) layer, each with its own API surface, authentication, and purpose. Think of it as two different storefronts serving the same underlying engine.

---

### 🏪 Website Merchants BFF — The Marketing Front Window

**Endpoint:** `GET /api/v1/bff/website/...`  
**Auth:** None (public)  
**Purpose:** The merchant's public-facing storefront. These endpoints power the landing page, discovery, and pricing tables that visitors see without logging in.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/bff/website/categories` | Browse the merchant's wares — categories like Commerce, Restaurant, Clinic, Salon, and more. |
| `GET /api/v1/bff/website/featured` | Meet the stars — featured/tenanted shops highlighted on the homepage. |
| `GET /api/v1/bff/website/pricing` | Price tags — subscription plans (Starter/Free, Business/$29, Enterprise/$99) displayed for decision-making. |

**Vibe:** Open house. No key required. Anyone can window-shop, check out the catalog, and see pricing. Perfect for the top-of-funnel experience.

---

### 📱 Mobile BFF — The App's Control Center

**Endpoint:** `GET /api/v1/bff/mobile/...`  
**Auth:** Mix of public (3) and JWT (6)  
**Purpose:** The React Native runtime's single source of truth. The mobile app makes ~9 calls to this BFF to render the entire app UI via Server-Driven UI (SDUI). One request = one complete app configuration.

#### 🔓 Public Calls (3) — No login required
| Endpoint | What you get |
|----------|-------------|
| `GET /bff/mobile/tenant/:slug/manifest` | The **app blueprint** — theme colors, navigation, every page → section → component, cached for 5 minutes. This is the SDUI contract that tells the app what to render. |
| `GET /bff/mobile/discovery` | The home screen feed — featured merchants + hardcoded category list (Commerce, Restaurant, Fashion, etc.). |
| `GET /bff/mobile/merchants/:tenantId/catalog` | The shop window — product catalog for a specific merchant, filterable by category or search, with pagination. |

#### 🔐 JWT-Protected Calls (6) — Logged-in user only
| Endpoint | What you get |
|----------|-------------|
| `GET /bff/mobile/profile` | **Who am I?** — Your profile, your active merchant memberships, and your consent choices (all stripped of password hashes). |
| `GET /bff/mobile/notifications` | **Inbox** — Your last 50 notifications plus a count of unread ones, so the app can badge the icon. |
| `POST /bff/mobile/profile/deactivate` | **Soft delete** — Mark your account inactive for 30 days. Log out everywhere. If you do nothing, it auto-permanently deletes after 30 days. |
| `POST /bff/mobile/profile/reactivate` | **Cancel deactivation** — Bring the account back to life, as long as you're within the 30-day window. |
| `DELETE /bff/mobile/profile` | **Permanent deletion** — Immediately and irrevocably remove the account (GDPR/Apple/Google compliant). Refused if you own any merchants — you must transfer/delete those first. |
| `GET /bff/mobile/profile/deactivation-status` | **Countdown** — How many days remain before permanent deletion? The app uses this to warn the user. |

**Vibe:** Authenticated personal dashboard. This is your app's heart — profile, alerts, and the power to deactivate/delete. The mobile app makes ~15 API calls total per session, with ~6 hitting this BFF.

---

### 📊 Endpoint Statistics — At a Glance

| Metric | Value |
|--------|-------|
| **Total website & mobile endpoints** | 12 |
| **Public (no auth)** | 6 (3 website + 3 mobile) |
| **Authenticated (JWT)** | 6 (all mobile profile/notifications/deactivate actions) |
| **Mobile / Website ratio** | 9 vs 3 — mobile has more because it fuels the full app lifecycle |

### 🔍 Key Differences — Website vs Mobile

| Aspect | Website BFF | Mobile BFF |
|--------|-------------|------------|
| **Purpose** | Marketing/landing pages — the "window shopper" experience | React Native runtime — the "app in your pocket" experience |
| **Authentication** | All public — anyone can browse | 3 public (discovery/catalog/manifest), 6 JWT-protected (user profile/lifecycle) |
| **Data Shape** | Categories, featured items, pricing tables | Full SDUI manifest (theme, navigation, pages→sections→components), profile data, notifications |
| **User Scope** | Anonymous visitors | Logged-in users only |
| **Typical Use Case** | Home page, pricing tables, discover page | App installation, user profile, in-app navigation, settings |

### � Quick Access

| Service | URL |
|---------|-----|
| **Website BFF** | `https://duka-backend-production.up.railway.app/api/bff/website/...` |
| **Mobile BFF** | `https://duka-backend-production.up.railway.app/api/bff/mobile/...` |
| **Swagger Docs** | `https://duka-backend-production.up.railway.app/api/docs` |

---

**Bottom line:** The website BFF is your public showcase — 3 clean, unauthenticated endpoints that present the merchant to the world. The mobile BFF is the app's engine — 9 endpoints (3 public, 6 protected) that configure, personalize, and manage the user's app experience. Together they power the DUKADESK "no app store" model: the backend drives the UI, and the app simply renders whatever the backend serves.

**Personal Notes** — Continue adding observations, decisions, and TODOs as development progresses.

---

## 10. Backend Remediation Summary — Published Logo/Release Mismatch (2026-09-20)

### Incident

Merchant `aa0cd445` (Emmanuel Akinyemi) — editor reported v0.0.23 while mobile served Storefront v0.0.7 with a 404 logo. Root cause: no published `Release` record existed; the merchant editor saved locally but the backend never received the compiled manifest.

### What Backend Fixed

| Area | Change | Endpoint Affected |
|------|--------|-------------------|
| **S3-compatible storage** | `StorageService` — uploads persist to S3/R2 instead of ephemeral local disk. Activate with `STORAGE_PROVIDER=s3` on Railway. | `POST /app/media/upload` |
| **Manifest body publish** | `POST /publishing/publish` now accepts `{ manifest, version }` body. If `manifest.screens` is non-empty, persists directly as a new Release — no draft compilation required. Handles screens as array, object, or string array. | `POST /merchants/{id}/publishing/publish` |
| **Body size limit** | Express body parser increased to 5MB to accommodate URL-only manifests with many screens. | All POST endpoints |
| **Duplicate release prevention** | Draft path: compiler creates draft Release → publish promotes to published. Client path: supersedes old published → creates new. No more duplicate records. | `POST /publishing/publish` |
| **Rollback cache fix** | Rollback now invalidates both `manifest:{tenantId}` and `manifest:{slug}` cache keys. | `POST /publishing/rollback/:version` |
| **WebP self-delete guard** | Optimization only deletes original file if the path differs from the optimized output (prevents deleting the WebP when the original upload was already WebP). | `POST /app/media/upload` |

### What Mobile Needs to Do

1. **Re-publish from merchant editor.** The backend now accepts the client-compiled manifest directly. The editor should POST `{ manifest: { screens: [...], ... } }` to `POST /api/v1/merchants/{id}/publishing/publish` with a valid JWT.

2. **Verify manifest parity.** After publish, confirm both endpoints return the same version:
   - `GET /api/v1/merchants/{id}/definition` → `data.app.version`
   - `GET /api/v1/bff/mobile/tenant/{slug}/manifest` → `data.app.version`

3. **Verify logo delivery.** Every `identity.logo` or `theme.brand.logo` URL returned in the manifest must return HTTP 200 without authentication. If logos were uploaded before S3 was configured, they need to be re-uploaded.

4. **Handle manifest shapes.** The manifest may contain:
   - `data.config.config.deployed.screens` (nested — older format)
   - `data.config.screens` (flat — legacy)
   - `data.screens` (top-level — current)
   
   Mobile resolver should check all three paths.

5. **Force refresh after publish.** The BFF caches manifests for 5 minutes (Redis TTL 300s). After a successful publish, the mobile app should invalidate its local manifest cache and re-fetch from the BFF.

### Railway Environment Variables Required

```
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=dukadesk
STORAGE_ACCESS_KEY=<access-key>
STORAGE_SECRET_KEY=<secret-key>
CDN_URL=https://<your-cdn-domain>
```

Until S3 is configured, uploads use local disk (works but ephemeral on Railway deploys).