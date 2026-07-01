# DUKA-BACKEND

Multi-tenant Backend-as-a-Platform (BaaP) powering the DUKADESK ecosystem. Businesses register once, create branded app configurations, and instantly publish updates to customers through a single React Native runtime — no separate app stores needed.

## Architecture

```
                        ┌──────────────────────────────────────┐
                        │          API Gateway / BFF            │
                        │  Rate Limiter → Mobile/Tenant/Biz/WWW │
                        └──────────┬───────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────────┐
        │                          │                              │
   ┌────┴─────┐            ┌───────┴───────┐           ┌─────────┴─────────┐
   │  Phase 0 │            │   Phase 1     │           │    Phase 2        │
   │  Infra   │            │   Platform    │           │    Domain         │
   │──────────│            │───────────────│           │───────────────────│
   │ EventBus │            │ IAM (identity)│           │ Commerce (cart,   │
   │ RBAC     │            │ Tenants       │           │ orders, coupons)  │
   │ Redis    │            │ BFF Layer     │           │ Booking & Sched.  │
   │ Queue    │            │ Publishing    │           │ Forms & Workflow  │
   │ Logger   │            │ DAM (media)   │           │ Payments (FW, PS) │
   │ Health   │            │               │           │ Notifications     │
   └────┬─────┘            └───────┬───────┘           └─────────┬─────────┘
        │                          │                             │
        └──────────────────────────┼─────────────────────────────┘
                                   │
                        ┌──────────┴──────────┐
                        │    PostgreSQL 16     │
                        │    + Redis 7         │
                        └─────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (Node.js + TypeScript) |
| ORM | Prisma 6.19 |
| Database | PostgreSQL 16 |
| Cache & Pub/Sub | Redis 7 (ioredis, with in-memory mock fallback) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Queue | Bull/BullMQ (5 queues: publishing, notifications, assets, webhooks, analytics) |
| Image Processing | Sharp (webp conversion, 5 variant presets) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger (OpenAPI) |
| Logging | nestjs-pino + pino-pretty (structured, correlation IDs) |
| File Storage | Local (S3/R2 adapter-ready) |

## Project Structure

```
src/
├── main.ts
├── app.module.ts                    # Root module (25+ feature modules)
├── common/                          # Shared infrastructure
│   ├── decorators/                  # @Public(), @CurrentUser(), @Permissions()
│   ├── guards/                      # JwtAuthGuard, RbacGuard
│   ├── interceptors/                # TransformInterceptor (response envelope)
│   ├── filters/                     # HttpExceptionFilter
│   ├── middleware/                   # Correlation ID middleware
│   ├── strategies/                  # JwtStrategy (Passport)
│   ├── pipes/                       # Validation pipe
│   ├── dto/                         # Shared DTOs
│   ├── redis/                       # RedisService (ioredis + mock fallback)
│   ├── logger/                      # LoggerService (structured, contextual)
│   ├── prisma.service.ts / .module.ts
├── shared/                          # Cross-module features
│   ├── events/                      # EventBusService (in-process pub/sub)
│   ├── context/                     # TenantContextService (AsyncLocalStorage)
│   ├── queue/                       # QueueService, QueueModule (Bull)
│   ├── interfaces/                  # DomainEvent interface
│   └── types/
├── gateway/                         # GatewayRateLimiter (Redis sliding window)
├── bff/                             # Backend-for-Frontend layer
│   ├── mobile/                      # Manifest, discovery, profile, notifications, catalog
│   ├── tenant-dashboard/            # Summary, analytics, integration status
│   ├── business-dashboard/          # Platform overview, tenant list, audit logs
│   └── website/                     # Categories, featured tenants, pricing
└── modules/                         # 22 feature modules
    ├── auth/                        # Register, login, OTP (Redis-backed), refresh
    ├── users/                       # Profile, consents, memberships
    ├── iam/                         # Devices, password policies, recovery
    ├── rbac/                        # Roles, permissions, role-permission mapping
    ├── health/                      # Health check endpoint
    ├── tenants/                     # CRUD, config, subscriptions, feature flags
    ├── builder/                     # Pages, sections, components, nav, theme
    ├── renderer/                    # App definition JSON (SDUI contract)
    ├── publishing/                  # Validation, manifest compiler, releases, rollback
    ├── media/                       # Upload, ImageOptimizer, variants, folders, CDN
    ├── commerce/                    # Products, categories, cart, orders, coupons, tax, fulfillment, variants
    ├── booking/                     # Services, staff, resources, schedules, availability, bookings
    ├── forms/                       # Forms, fields, submissions, validation, approval workflow
    ├── payments/                    # PaymentAdapter interface, Paystack, Flutterwave, intents, webhooks
    ├── notifications/               # Templates, push/email/in-app, preferences, device tokens
    ├── templates/                   # Seed templates (Store, Restaurant, Clinic)
    ├── discovery/                   # Featured, search, categories
    ├── admin/                       # Tenant approval/suspension, stats
    ├── qr/                          # QR metadata generation & resolution
    └── theme/                       # Theme management
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

API at `http://localhost:4000/api/v1` — Swagger docs at `http://localhost:4000/api/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile to dist/ |
| `npm run start:prod` | Run compiled build |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run dev migrations |
| `npm run prisma:seed` | Seed data |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run docker:up` | Start PostgreSQL + Redis |

## API Reference

### Authentication `/api/v1/auth`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Create account |
| POST | `/login` | No | Login (returns JWT + refresh) |
| POST | `/refresh` | No | Rotate refresh token |
| POST | `/logout` | JWT | Revoke all refresh tokens |
| POST | `/send-otp` | No | Send OTP (Redis-backed, 5min TTL) |
| POST | `/verify-otp` | No | Verify OTP, mark email verified |

### Profile `/api/v1/profile`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get user + profile |
| PUT | `/` | Update user + upsert profile |
| GET | `/memberships` | List tenant memberships |
| GET | `/consents` | List consents with scopes |
| POST | `/consents` | Grant/update consent |
| DELETE | `/consents/:tenantId` | Revoke consent |

### IAM `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/devices` | Register device (token, platform) |
| GET | `/devices` | List devices |
| PUT | `/devices/:id` | Update device |
| DELETE | `/devices/:id` | Revoke device |
| POST | `/auth/forgot-password` | Send reset link (Redis token, 1hr TTL) |
| POST | `/auth/reset-password` | Reset password (validates strength + history) |

### Tenants `/api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tenants` | JWT | Create tenant + join as owner |
| GET | `/tenants/my` | JWT | My tenants |
| GET | `/tenants/:id` | Public | Get tenant details |
| PUT | `/tenants/:id` | JWT | Update tenant (owner) |
| POST | `/tenants/:id/publish` | JWT | Publish tenant |

### Tenant Config & Subscriptions `{JWT} /api/v1/tenants/:id`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Get runtime config |
| PUT | `/config` | Update config (languages, currency, timezone, region, offlinePolicy) |
| POST | `/subscribe` | Subscribe to plan |
| GET | `/subscription` | Current subscription status |
| POST | `/cancel` | Cancel subscription |
| GET | `/features` | Resolved feature flags from plan |

### Publishing `{JWT} /api/v1/tenants/:id/publishing`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/validate` | Validate draft (pages, slugs, sections, theme, nav) |
| POST | `/publish` | Compile manifest + publish release |
| GET | `/releases` | Release history |
| GET | `/releases/:version` | Get specific release |
| POST | `/rollback/:version` | Rollback to previous version |
| GET | `/draft` | Current draft state |

### Media / DAM `{JWT} /api/v1/tenants/:tenantId/media`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload (auto-optimizes images, generates variants) |
| GET | `/` | List media (filter by folderId) |
| GET | `/:id` | Get media details |
| PATCH | `/:id` | Update metadata (fileName, alt, folderId, visibility) |
| DELETE | `/:id` | Delete + all variants |
| GET | `/:id/cdn-url` | Get CDN URL (optional ?variant=) |
| POST | `/folders` | Create folder |
| GET | `/folders` | List folders |
| PATCH | `/folders/:id` | Update folder |
| DELETE | `/folders/:id` | Delete empty folder |

### Commerce `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenants/:tid/categories` | Create category |
| GET | `/tenants/:tid/categories` | List categories (public) |
| PUT | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Soft-delete category |
| POST | `/tenants/:tid/products` | Create product (with variants) |
| GET | `/tenants/:tid/products` | List products (paginated, filterable, sortable) |
| GET | `/products/:id` | Get product (public) |
| PUT | `/products/:id` | Update product |
| DELETE | `/products/:id` | Soft-delete |
| POST | `/products/:pid/variants` | Create variant |
| PUT | `/variants/:id` | Update variant |
| DELETE | `/variants/:id` | Delete variant |

### Cart & Checkout `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenants/:tid/cart` | Get or create cart |
| GET | `/cart/:id` | Get cart with items |
| POST | `/cart/:id/items` | Add item |
| PATCH | `/cart/items/:itemId` | Update quantity |
| DELETE | `/cart/items/:itemId` | Remove item |
| POST | `/cart/:id/coupon` | Apply coupon |
| DELETE | `/cart/:id/coupon` | Remove coupon |
| POST | `/cart/:id/checkout` | Convert cart to order |

### Orders `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/:tid/orders` | List orders (filter by status) |
| GET | `/orders/:id` | Get order detail |
| POST | `/orders/:id/status` | Update status (validated transitions) |
| POST | `/orders/:oid/fulfillments` | Create fulfillment |
| GET | `/orders/:oid/fulfillments` | List fulfillments |
| PATCH | `/fulfillments/:id` | Update fulfillment |

### Coupons & Tax `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenants/:tid/coupons` | Create coupon |
| GET | `/tenants/:tid/coupons` | List coupons |
| PUT | `/coupons/:id` | Update |
| DELETE | `/coupons/:id` | Soft-delete |
| POST | `/tenants/:tid/tax-rules` | Create tax rule |
| GET | `/tenants/:tid/tax-rules` | List |
| PUT | `/tax-rules/:id` | Update |
| DELETE | `/tax-rules/:id` | Delete |
| GET | `/tenants/:tid/tax-calc` | Calculate tax (?subtotal=&region=) |

### Booking `{JWT} /api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tenants/:tid/booking/services` | JWT | Create service |
| GET | `/tenants/:tid/booking/services` | Public | List services |
| GET | `/booking/services/:id` | Public | Get service |
| PUT | `/booking/services/:id` | JWT | Update |
| DELETE | `/booking/services/:id` | JWT | Soft-delete |
| POST | `/tenants/:tid/booking/staff` | JWT | Create staff with service assignments |
| GET | `/tenants/:tid/booking/staff` | Public | List staff |
| GET | `/booking/staff/:id` | Public | Get staff member |
| PUT | `/booking/staff/:id` | JWT | Update |
| DELETE | `/booking/staff/:id` | JWT | Soft-delete |
| POST | `/tenants/:tid/booking/resources` | JWT | Create resource |
| GET | `/tenants/:tid/booking/resources` | Public | List |
| PUT | `/booking/resources/:id` | JWT | Update |
| DELETE | `/booking/resources/:id` | JWT | Delete |
| POST | `/tenants/:tid/booking/schedules` | JWT | Create schedule |
| GET | `/tenants/:tid/booking/schedules` | Public | List (filter by staffId, resourceId) |
| PUT | `/booking/schedules/:id` | JWT | Update |
| DELETE | `/booking/schedules/:id` | JWT | Delete |
| GET | `/tenants/:tid/booking/availability` | Public | Get slots (?serviceId=&date=) |
| POST | `/tenants/:tid/booking` | Public | Create booking |
| GET | `/tenants/:tid/booking` | JWT | List bookings |
| GET | `/booking/:id` | JWT | Get booking with history |
| POST | `/booking/:id/status` | JWT | Update status (validated transitions) |
| POST | `/tenants/:tid/booking/waiting-list` | Public | Add to waiting list |
| GET | `/tenants/:tid/booking/waiting-list` | JWT | Get waiting list |
| POST | `/booking/waiting-list/:id/notify` | JWT | Mark notified |

### Forms & Workflow `{JWT} /api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tenants/:tid/forms` | JWT | Create form with fields |
| GET | `/tenants/:tid/forms` | JWT | List forms |
| GET | `/forms/:id` | Public | Get form with fields + workflow |
| PUT | `/forms/:id` | JWT | Update (auto-increments version) |
| DELETE | `/forms/:id` | JWT | Delete |
| POST | `/forms/:id/submit` | Public | Submit answers |
| GET | `/forms/:id/submissions` | JWT | List submissions |
| GET | `/submissions/:id` | JWT | Get submission |
| POST | `/forms/:id/workflow` | JWT | Set approval workflow |
| POST | `/submissions/:id/approve` | JWT | Approve/reject |

### Payments `{JWT} /api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/tenants/:tid/payments/initialize` | JWT | Initialize payment (select provider) |
| POST | `/payments/:intentId/verify` | JWT | Verify with provider |
| GET | `/tenants/:tid/payments` | JWT | List payment intents |
| GET | `/tenants/:tid/payments/accounts` | JWT | Get payment accounts |
| POST | `/payments/webhook/:provider` | Public | Provider webhook |

### Notifications `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List (filter by unreadOnly, type) |
| GET | `/notifications/unread-count` | Unread count |
| PUT | `/notifications/:id/read` | Mark read |
| POST | `/notifications/mark-all-read` | Mark all read |
| POST | `/notifications/send` | Send directly |
| POST | `/notifications/templates` | Create template |
| GET | `/notifications/templates` | List templates |
| PUT | `/notifications/templates/:id` | Update |
| DELETE | `/notifications/templates/:id` | Delete |
| POST | `/notifications/send-from-template` | Send from template |
| GET | `/notifications/preferences` | Get preferences |
| POST | `/notifications/preferences` | Set preference |
| POST | `/notifications/devices` | Register device |
| DELETE | `/notifications/devices/:token` | Unregister device |

### Builder & Renderer `/api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/tenants/:tid/pages` | Public | List pages with sections + components |
| PUT | `/pages/:id` | JWT | Update page |
| POST | `/pages/:pid/sections` | JWT | Add section |
| PUT | `/sections/:id` | JWT | Update section |
| POST | `/sections/:sid/components` | JWT | Add component |
| PUT | `/components/:id` | JWT | Update component |
| GET | `/tenants/:tid/navigation` | Public | Get navigation |
| PUT | `/tenants/:tid/navigation` | JWT | Upsert navigation |
| GET | `/tenants/:tid/theme` | Public | Get theme |
| PUT | `/tenants/:tid/theme` | JWT | Upsert theme |
| GET | `/tenants/:id/definition` | Public | SDUI app definition JSON |
| GET | `/resolve/:slug` | Public | Resolve slug to tenant |

### Discovery, QR, Admin `/api/v1`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/discovery/featured` | Public | Featured tenants |
| GET | `/discovery/search` | Public | Search (?q=) |
| GET | `/discovery/categories` | Public | Static categories |
| GET | `/discovery/nearby` | Public | Nearby (stub) |
| POST | `/qr/generate/:tid` | JWT | Generate QR metadata |
| GET | `/qr/resolve/:slug` | Public | Resolve deep link |
| POST | `/admin/tenants/:id/approve` | JWT | Approve tenant |
| POST | `/admin/tenants/:id/suspend` | JWT | Suspend |
| GET | `/admin/tenants` | JWT | List all tenants |
| GET | `/admin/stats` | JWT | Platform stats |

### API Gateway `{JWT} /api/v1`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |

### BFF Endpoints `{JWT} /api/v1/bff`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mobile/manifest/:id` | Mobile app manifest (cached 5min) |
| GET | `/mobile/discovery` | Discovery feed |
| GET | `/mobile/profile` | Aggregated user profile |
| GET | `/mobile/notifications` | Notifications + unread count |
| GET | `/mobile/catalog` | Tenant catalog (paginated, searchable) |
| GET | `/tenant-dashboard/summary` | Dashboard counts |
| GET | `/tenant-dashboard/analytics` | 30-day analytics |
| GET | `/tenant-dashboard/integrations` | Payment account status |
| GET | `/business-dashboard/overview` | Platform stats |
| GET | `/business-dashboard/tenants` | Paginated tenant list |
| GET | `/business-dashboard/audit-logs` | Recent audit logs |
| GET | `/website/categories` | Public categories |
| GET | `/website/featured` | Featured tenants |
| GET | `/website/pricing` | Subscription plans |

## Database Schema

30+ models across 12 domains. Key model groups:

| Domain | Models |
|--------|--------|
| **IAM** | User, Profile, RefreshToken, Device, PasswordHistory, Consent, ConsentScope |
| **RBAC** | Role, Permission, RolePermission, UserRole |
| **Tenant** | Tenant, TenantUser, TenantConfig, SubscriptionPlan, Subscription, TenantDomain |
| **Builder** | Page, Section, Component, Navigation, Theme, Template |
| **Publishing** | Draft, Release, ValidationReport |
| **DAM** | Media, AssetFolder, AssetVersion |
| **Commerce** | Category, Product, ProductImage, ProductVariant, Cart, CartItem, Order, OrderItem, OrderStatusHistory, Coupon, Fulfillment, TaxRule |
| **Booking** | BookingService, StaffMember, BookingResource, Schedule, Booking, BookingHistory, WaitingListEntry |
| **Forms** | Form, FormField, FormSubmission, FormApproval, FormWorkflow |
| **Payments** | PaymentProvider, TenantPaymentAccount, PaymentIntent, PaymentTransaction, WebhookEvent, FinancialEvent |
| **Notifications** | Notification, NotificationTemplate, NotificationEvent, NotificationPreference, DeviceToken, DeliveryResult |
| **Admin** | AuditLog |

## Infrastructure Modules (Phase 0)

| Module | Description |
|--------|-------------|
| **EventBus** | In-process pub/sub with sync/async dispatch. Modules emit DomainEvent objects; subscribers are registered via `@OnEvent()`. |
| **TenantContext** | AsyncLocalStorage-based context propagation. TenantResolverMiddleware extracts tenant from header/slug/domain and makes it available via TenantContextService. |
| **Redis** | ioredis wrapper with automatic in-memory mock fallback when `localhost:6379` is unreachable. Used for OTP, rate limiting, cache, pub/sub. |
| **Queue (Bull)** | 5 job queues: publishing, notifications, assets, webhooks, analytics. QueueService provides a typed interface. |
| **Structured Logging** | nestjs-pino with pino-pretty. LoggerService auto-attaches correlationId, tenantId, userId to every log entry. |
| **Health** | `GET /health` endpoint returning DB connectivity, uptime, and dependency status. |
| **RBAC** | Role/permission model with 4 seed roles (super_admin, support, operations, finance), 20 permissions. RbacGuard validates using `@RequireRole()` or `@RequirePermission()` decorators. |

## Response Format

```json
// Success
{ "success": true, "message": "OK", "data": { } }

// Error
{ "success": false, "errors": ["Error message"] }

// Paginated
{ "success": true, "message": "OK", "data": [...], "meta": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }
```

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
| 0 | Infrastructure (EventBus, Redis, Queue, RBAC, Logging, Health) | ✅ Complete |
| 1.1 | IAM Platform (devices, passwords, recovery) | ✅ Complete |
| 1.2 | Tenant Platform (config, subscriptions, features) | ✅ Complete |
| 1.3 | API Gateway & BFF (rate limiter, 4 backends) | ✅ Complete |
| 1.4 | Publishing Pipeline (validation, manifest, versions, rollback) | ✅ Complete |
| 1.5 | DAM (Sharp optimization, variants, folders, CDN) | ✅ Complete |
| 2.1 | Commerce (cart, orders, coupons, tax, fulfillment, variants) | ✅ Complete |
| 2.2 | Booking & Scheduling (availability engine, 7-state workflow) | ✅ Complete |
| 2.3 | Forms & Workflow (validation engine, approval workflow) | ✅ Complete |
| 2.4 | Payments (Paystack, Flutterwave, intents, webhooks) | ✅ Complete |
| 2.5 | Notifications (templates, push/email, preferences, devices) | ✅ Complete |
| 3 | Enhancement (discovery, QR, admin, analytics, search, theme) | 📋 Pending |
