# DUKA-BACKEND

Multi-tenant Backend-as-a-Platform (BaaP) powering the DUKADESK ecosystem. Businesses register once, create branded app configurations, and instantly publish updates to customers through a single React Native runtime — no separate app stores needed.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Three-Tier API Architecture                  │
├─────────────┬─────────────────┬─────────────────────────┤
│   Website   │       App       │         Mobile          │
│  (Platform) │ (Tenant Self-Service) │  (Consumer)        │
├─────────────┼─────────────────┼─────────────────────────┤
│ /admin/*    │ /app/*          │ /merchants/:id/*        │
│ /auth/*     │ (auto-resolved) │ (public read)           │
│ /discovery/*│                 │                         │
│ /bff/website│                 │                         │
├─────────────┴─────────────────┴─────────────────────────┤
│                  Feature Modules (32)                     │
│  Auth │ Commerce │ Booking │ Forms │ Payments │ Builder  │
│  Notifications │ Theme │ Integrations │ Analytics │ ...  │
├─────────────────────────────────────────────────────────┤
│              Infrastructure Layer                         │
│  EventBus │ Redis │ Queue (Bull) │ RBAC │ Logging        │
├─────────────────────────────────────────────────────────┤
│         PostgreSQL 16  +  Redis 7  +  Prisma 6           │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (Node.js + TypeScript 6, SWC builder) |
| ORM | Prisma 6.19 |
| Database | PostgreSQL 16 |
| Cache & Pub/Sub | Redis 7 (ioredis, with in-memory mock fallback) |
| Auth | JWT (access + refresh rotation), bcrypt, Google OAuth, Apple Sign-In |
| Queue | Bull (5 queues: publishing, notifications, assets, webhooks, analytics) |
| Image Processing | Sharp (webp conversion, 5 variant presets) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger (OpenAPI) |
| Logging | nestjs-pino + pino-pretty (structured, correlation IDs) |
| Testing | Jest + ts-jest + Supertest (5 unit suites / 38 tests: manifest validator, publishing, active release, media, press-action round-trip) |
| Deployment | Docker (2-stage build) + Railway |

## Three-Tier Endpoint Architecture

| Tier | Path Prefix | Audience | Auth | Purpose |
|------|-------------|----------|------|---------|
| **Website (Platform)** | `/admin/*`, `/auth/*`, `/discovery/*`, `/templates/*`, `/bff/website/*` | Platform operators | JWT / Public | Registration, tenant creation, admin |
| **App (Tenant Self-Service)** | `/app/*` | Tenant owners/managers | JWT + `@CurrentUser` | Write + config for own tenant |
| **Mobile/Consumer** | `/merchants/:merchantId/*` | End users (public) | `@Public()` or JWT | Read-only catalog, booking, checkout |

**Tenant Resolution:** `TenantResolverService` resolves `tenantId` from authenticated user's `TenantUser` membership (`owner` or `manager` role, `active` status).

## Project Structure

```
src/
├── main.ts
├── app.module.ts                    # Root module (32+ feature modules)
├── common/                          # Shared infrastructure
│   ├── decorators/                  # @Public(), @CurrentUser(), @Permissions()
│   ├── guards/                      # JwtAuthGuard, RbacGuard
│   ├── interceptors/                # TransformInterceptor (response envelope)
│   ├── filters/                     # HttpExceptionFilter
│   ├── middleware/                   # Correlation ID middleware
│   ├── strategies/                  # JwtStrategy (Passport)
│   ├── pipes/                       # Validation pipe
│   ├── redis/                       # RedisService (ioredis + mock fallback)
│   ├── logger/                      # LoggerService (structured, contextual)
│   ├── prisma.service.ts / .module.ts
├── shared/                          # Cross-module features
│   ├── events/                      # EventBusService (in-process pub/sub)
│   ├── tenant/                      # TenantResolverService (owner/manager resolution)
│   ├── queue/                       # QueueService, QueueModule (Bull)
│   └── interfaces/                  # DomainEvent interface
├── gateway/                         # GatewayRateLimiter (Redis sliding window)
├── bff/                             # Backend-for-Frontend layer
│   ├── mobile/                      # Manifest, discovery, profile, notifications, catalog
│   ├── tenant-dashboard/            # Summary, analytics, integration status
│   ├── business-dashboard/          # Platform overview, tenant list, analytics, revenue
│   └── website/                     # Categories, featured tenants, pricing
└── modules/                         # 32 feature modules
    ├── auth/                        # Register, login, OTP, Google/Apple OAuth, refresh
    ├── users/                       # Profile, consents, memberships, deactivation
    ├── merchants/                   # CRUD, config, subscription, publish (App + Public)
    ├── iam/                         # Devices, password policies, recovery
    ├── rbac/                        # Roles, permissions, role-permission mapping
    ├── templates/                   # Seed templates (Store, Restaurant, Clinic)
    ├── builder/                     # Pages, sections, components, nav, actions, conditions
    ├── renderer/                    # App definition JSON (SDUI contract)
    ├── publishing/                  # Validation, manifest compiler, releases, rollback
    ├── media/                       # Upload, ImageOptimizer, variants, folders, CDN
    ├── commerce/                    # Products, cart, orders, coupons, tax, fulfillment
    ├── booking/                     # Services, staff, resources, schedules, availability
    ├── forms/                       # Forms, fields, submissions, approval workflow
    ├── payments/                    # Paystack/Flutterwave/Stripe, intents, refunds
    ├── notifications/               # Templates, push/email/SMS, campaigns, preferences
    ├── theme/                       # Theme management, compiler, caching
    ├── integrations/                # Connector framework, SendGrid, Google Calendar
    ├── analytics/                   # Event tracking, dashboards with widget data resolution
    ├── search/                      # Full-text index, synonyms, autocomplete, facets
    ├── ai/                          # OpenAI/Anthropic/Mock providers, prompts, embeddings
    ├── platform-admin/              # Settings, announcements, feature flags, quotas
    ├── infrastructure/              # Deployments, environments, health checks, backups
    ├── security/                    # Policies, API keys, security events, consent audits
    ├── developer/                   # Developer apps, webhook endpoints, event logs
    ├── marketplace/                 # Listings, plugin installations
    └── assets-enhanced/             # Collections, shares, storage providers
```

## Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop (for PostgreSQL + Redis)

### Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed (roles, permissions, plans, templates, providers)
npx prisma db seed

# Start development server
npm run start:dev
```

API at `https://duka-backend-production.up.railway.app/api/v1` — Swagger docs at `/api/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile to dist/ |
| `npm run start:prod` | Run compiled build |
| `npm run lint` | Lint + auto-fix |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run dev migrations |
| `npm run prisma:seed` | Seed data |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run docker:up` | Start PostgreSQL + Redis |

## API Reference (~447 Endpoints)

### Authentication `/api/v1/auth`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create account |
| POST | `/login` | Login (returns JWT + refresh) |
| POST | `/refresh` | Rotate refresh token |
| POST | `/logout` | Revoke all refresh tokens |
| POST | `/send-otp` | Send OTP (Redis-backed, 5min TTL) |
| POST | `/verify-otp` | Verify OTP, mark email verified |
| POST | `/google` | Sign in with Google ID token |
| POST | `/apple` | Sign in with Apple identity token |
| POST | `/forgot-password` | Send reset link |
| POST | `/reset-password` | Reset password (validates strength + history) |

### Profile `/api/v1/profile`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get user + profile |
| PUT | `/` | Update user + upsert profile |
| GET | `/memberships` | List tenant memberships |
| GET | `/consents` | List consents with scopes |
| POST | `/consents` | Grant/update consent |
| DELETE | `/consents/:tenantId` | Revoke consent |
| POST | `/deactivate` | Soft deactivation (30-day) |
| POST | `/reactivate` | Reactivate within 30 days |
| DELETE | `/` | Immediate permanent deletion |
| GET | `/deactivation-status` | Days remaining before permanent delete |

### Merchants — App (Self-Service) `{JWT} /api/v1/app`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/merchants` | Get my merchants |
| PUT | `/merchants` | Update current merchant |
| POST | `/merchants/publish` | Publish (owner/manager only) |
| GET | `/merchants/config` | Get runtime config |
| PUT | `/merchants/config` | Update config |
| GET | `/merchants/subscription` | Get subscription |
| POST | `/merchants/subscribe` | Subscribe to plan |
| POST | `/merchants/subscription/cancel` | Cancel subscription |

### Commerce — App `{JWT} /api/v1/app/commerce`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/categories` | Create category |
| GET | `/categories` | List categories |
| POST | `/products` | Create product with variants |
| GET | `/products` | List products (filtered, paginated) |
| PUT | `/products/:id` | Update product |
| DELETE | `/products/:id` | Delete product |
| POST | `/products/:id/reserve` | Reserve inventory |
| POST | `/products/:id/adjust-stock` | Adjust stock level |
| POST | `/coupons` | Create coupon |
| POST | `/tax-rules` | Create tax rule |
| GET | `/orders` | List orders |
| POST | `/orders/:id/status` | Update order status |

### Commerce — Public `/api/v1/merchants/:merchantId`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/categories` | List categories |
| GET | `/products` | List products |
| POST | `/cart` | Get or create cart |
| POST | `/cart/:id/items` | Add item to cart |
| POST | `/cart/:id/checkout` | Convert cart to order |
| GET | `/orders` | List orders |
| GET | `/orders/:id` | Get order detail |
| POST | `/tax-calc` | Calculate tax |

### Booking — App `{JWT} /api/v1/app/booking`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/services` | Create service |
| GET | `/services` | List services |
| POST | `/staff` | Create staff |
| POST | `/resources` | Create resource |
| POST | `/schedules` | Create schedule |
| GET | `/availability` | Get available slots |
| GET | `/` | List bookings |
| POST | `/:id/status` | Update booking status |

### Booking — Public `/api/v1/merchants/:merchantId/booking`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/services` | List services |
| GET | `/locations` | List locations |
| GET | `/cancellation-policies` | List policies |
| GET | `/availability` | Get slots |
| POST | `/` | Create booking |

### Forms — App `{JWT} /api/v1/app/forms`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create form with fields |
| GET | `/` | List forms |
| PUT | `/:id` | Update form |
| DELETE | `/:id` | Delete form |
| POST | `/:id/workflow` | Set approval workflow |
| POST | `/submissions/:id/approve` | Approve/reject submission |

### Payments — App `{JWT} /api/v1/app/payments`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/initialize` | Initialize payment |
| POST | `/:intentId/verify` | Verify with provider |
| POST | `/:intentId/refund` | Process refund |

### Notifications — App `{JWT} /api/v1/app/notifications`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/templates` | Create template |
| POST | `/send-from-template` | Send from template |
| POST | `/send` | Send directly |
| POST | `/campaigns` | Send push/email campaign |

### Analytics — App `{JWT} /api/v1/app/analytics`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events` | Track analytics event |
| GET | `/widget-types` | Get widget types and metrics |
| POST | `/dashboards` | Create dashboard |
| GET | `/dashboards/:id/data` | Resolve all widget data |
| POST | `/dashboards/:dashboardId/widgets` | Add widget |

### Theme — App `{JWT} /api/v1/app/theme`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get theme config |
| PUT | `/` | Update theme |
| GET | `/versions` | Version history |
| POST | `/versions/:version/restore` | Restore version |

### Builder (Draft/Published Split) — App `{JWT} /api/v1/app`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/draft/initialize` | Initialize drafts from published state |
| GET | `/draft/status` | Get draft workspace status |
| POST | `/draft/discard` | Discard all drafts and reset |
| GET | `/pages` | Get all draft pages |
| PUT | `/pages/:pageId` | Update a draft page |
| DELETE | `/pages/:pageId` | Delete a draft page |
| POST | `/pages/:pageId/sections` | Add section to draft page |
| PUT | `/sections/:sectionId` | Update a draft section |
| DELETE | `/sections/:sectionId` | Delete a draft section |
| POST | `/sections/:sectionId/components` | Add component to draft section |
| PUT | `/components/:componentId` | Update a draft component |
| DELETE | `/components/:componentId` | Delete a draft component |
| GET | `/navigation` | Get navigation |
| PUT | `/navigation` | Update navigation |
| POST | `/preview` | Preview full app (from drafts) |
| POST | `/pages/:pageId/preview` | Preview single draft page |

### Renderer
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/definition` | Get deployed published definition (`?version=X.Y.Z` optional) |
| GET | `/resolve/:slug` | Resolve slug to tenant |

### Search — App `{JWT} /api/v1/app/search`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/index` | Index a document |
| POST | `/synonyms` | Create synonym |

### Integrations — App `{JWT} /api/v1/app/integrations`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connect` | Connect provider |
| POST | `/:provider/test` | Test connection |
| POST | `/:provider/sync` | Trigger sync |

### Security — App `{JWT} /api/v1/app/security`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policy` | Get security policy |
| PUT | `/policy` | Update policy |
| POST | `/api-keys` | Create API key |

### Admin `/api/v1/admin`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/merchants` | Create merchant |
| POST | `/merchants/:id/approve` | Approve merchant |
| POST | `/merchants/:id/suspend` | Suspend merchant |
| GET | `/merchants` | List all merchants |
| GET | `/stats` | Platform stats |
| GET | `/quotas/:merchantId` | Get API quota |
| PUT | `/quotas/:merchantId` | Update quota |

### Discovery `/api/v1/discovery`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/featured` | Featured merchants |
| GET | `/search` | Search merchants |
| GET | `/categories` | Categories |
| GET | `/nearby` | Nearby merchants |

### BFF Endpoints `/api/v1/bff`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/website/categories` | Public categories |
| GET | `/website/featured` | Featured tenants |
| GET | `/website/pricing` | Subscription plans |
| GET | `/tenant/:id/summary` | Dashboard summary |
| GET | `/tenant/:id/analytics` | 30-day analytics |
| GET | `/admin/overview` | Platform stats |
| GET | `/admin/merchants` | Paginated merchant list |
| GET | `/admin/analytics` | Revenue trend, user growth, order volume |
| GET | `/admin/revenue` | Revenue report |
| GET | `/admin/merchants/:merchantId/analytics` | Per-merchant analytics |
| GET | `/mobile/tenant/:slug/manifest` | SDUI manifest |
| GET | `/mobile/discovery` | Discovery feed |
| GET | `/mobile/merchants/:merchantId/catalog` | Merchant catalog |
| GET | `/mobile/profile` | User profile |
| GET | `/mobile/notifications` | Notifications |

### Other Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/qr/generate/:merchantId` | Generate QR code |
| GET | `/qr/resolve/:slug` | Resolve QR deep link |
| POST | `/templates/:id/use` | Apply template |
| GET | `/:id/definition` | SDUI app definition (from Release.manifest, `?version=` optional) |
| GET | `/resolve/:slug` | Resolve slug to tenant |

## Database Schema

85+ models across 32 domains. Key model groups:

| Domain | Models |
|--------|--------|
| **IAM** | User, Profile, RefreshToken, Device, PasswordHistory, Consent, ConsentScope |
| **RBAC** | Role, Permission, RolePermission, UserRole |
| **Tenant** | Tenant, TenantUser, TenantConfig, Plan, Subscription, TenantDomain |
| **Builder** | Page, Section, Component, Navigation, Theme, ThemeVersion, Template, DraftPage, DraftSection, DraftComponent |
| **Publishing** | Draft, Release, ValidationReport (DraftPage/DraftSection/DraftComponent hold builder edits) |
| **DAM** | Media (with templateId for shared asset pool), AssetFolder, AssetVersion |
| **Commerce** | Category, Product, ProductVariant, ProductImage, Cart, CartItem, Order, OrderItem, Coupon, Fulfillment, TaxRule, InventoryReservation |
| **Booking** | BookingService, StaffMember, BookingResource, Schedule, BookingLocation, CancellationPolicy, Booking, BookingHistory, BookingReminder, WaitingListEntry |
| **Forms** | Form, FormField, FormSubmission, FormApproval, FormWorkflow |
| **Payments** | PaymentProvider, TenantPaymentAccount, PaymentIntent, PaymentTransaction, WebhookEvent, Settlement, FinancialEvent |
| **Notifications** | NotificationTemplate, NotificationEvent, NotificationPreference, DeviceToken, DeliveryResult, Notification |
| **Analytics** | AnalyticsEvent, Dashboard, DashboardWidget, SavedReport |
| **Search** | SearchIndex, SearchQuery, SearchSynonym |
| **AI** | AIProvider, AIPrompt, AICompletion, AIEmbedding |
| **Admin** | PlatformSetting, SystemAnnouncement, FeatureFlag, ApiQuota |
| **Infra** | Deployment, Environment, HealthCheck, Backup |
| **Security** | SecurityPolicy, ApiKey, SecurityEvent, ConsentAudit |
| **Developer** | DeveloperApp, WebhookEndpoint, WebhookEventLog |
| **Marketplace** | MarketplaceListing, PluginInstallation |
| **Assets** | AssetCollection, AssetShare, StorageProvider |
| **Audit** | AuditLog |

## Seed Data

| Entity | Items |
|--------|-------|
| Roles | super_admin, support, operations, finance |
| Permissions | 20 (user.*, tenant.*, role.*, content.*, order.*, payout.*) |
| Subscriptions | Starter (free), Business ($29/mo), Enterprise ($99/mo) |
| Payment Providers | Flutterwave, Paystack, Stripe |
| Product Templates | Modern Store, Restaurant, Clinic |

## Implementation Status

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Infrastructure (EventBus, Redis, Queue, RBAC, Logging, Health) | Complete |
| 1 | Platform (IAM, Tenants, Gateway/BFF, Publishing, DAM) | Complete |
| 2 | Domain engines (Commerce, Booking, Forms, Payments, Notifications) | Complete |
| 3a | Enhancement (Theme, Builder, Commerce, Booking, Notifications, Payments) | Complete |
| 3b/3c | Integrations, Analytics, Search, AI, Platform Admin, Infra, Security, Developer | Complete |
| 4 | Marketplace, Asset Platform, Notification Adapters, Campaign Segmentation | Complete |
| v0.2 | Three-tier API architecture (Website/App/Mobile split) | Complete |
| v0.2 | TASK-0025: Customizable Dashboard (widget data resolution, DTOs, widget registry) | Complete |
| v0.3 | Draft/Published Split, Template Versioning, Media Hardening | Complete |
| v0.3.1 | P0 Admin Fixes — Status validation, Number() pagination, approve/reject, tenant soft-delete, analytics optional tenantId | Complete |
| v0.3.2 | P0 Admin Fixes v2 — UserStatus +pending/+rejected, case-insensitive filter, tenant alias, body+query invite, Swagger decorators | Complete |
| v0.3.3 | P0 tenantUsers Fix — Fixed tenantUsers→tenants (correct Prisma relation), dropped invalid role include (enum), added admin maintenance/policies stubs | Complete |
| v0.3.4 | Merchant reject + stats — TenantStatus +rejected, POST /admin/merchants/:id/reject with rejectionReason, GET /admin/merchants/stats by status | Complete |
| v0.3.5 | Published logo/release mismatch — S3 StorageService, manifest body publish, body limits, publish creates new Release directly | Complete |
| v0.3.6 | Publishing defect fixes — screen format normalization, duplicate release prevention, rollback cache invalidation, WebP self-delete guard | Complete |

## Completion Rate

**~91/100** — See `Reigner.md` for detailed breakdown.

## Response Format

```json
// Success
{ "success": true, "message": "OK", "data": { } }

// Error
{ "success": false, "errors": ["Error message"] }

// Paginated
{ "success": true, "message": "OK", "data": [...], "meta": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }
```
