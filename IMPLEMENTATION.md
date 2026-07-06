# DUKA-BACKEND Implementation

## Architecture Decisions

### Modular Monolith
All modules live in a single NestJS application but are fully decoupled. Each module has its own controller, service, and DTOs. Future extraction into microservices requires only wrapping modules in their own NestJS apps.

### Prisma ORM (v6)
Chosen over TypeORM for its type-safe queries, excellent migration support, and simpler schema definition. v6 used instead of v7 for stability.

### Passport + JWT
Standard NestJS authentication pattern. JWT access tokens (15min) + UUID refresh tokens (7 days). Refresh token rotation invalidates previous tokens.

### Global Modules
`IamModule`, `EventBusModule`, `TenantContextModule`, `RedisModule`, `QueueModule`, `LoggerModule`, `RbacModule` are all `@Global()` — every module can inject them without explicit imports.

### Server-Driven UI (SDUI)
The renderer generates a JSON application definition consumed by the React Native app. The publishing pipeline compiles manifests with versioning, checksum validation, and rollback support.

### Provider Adapter Pattern
Payments (Paystack, Flutterwave, Stripe), notifications (Email — SendGrid/Resend/SES/SMTP, Push — Expo/FCM/APNS, SMS — Twilio/Termii/AfricaTalking), and integrations (SendGrid, Google Calendar) use a uniform adapter interface, making it trivial to add new providers.

---

## Module Implementation Details

### 1. Auth Module
**Files**: `src/modules/auth/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/auth/register` | POST | Public | Creates user, returns JWT + refresh |
| `/api/v1/auth/login` | POST | Public | Validates credentials, returns tokens |
| `/api/v1/auth/refresh` | POST | Public | Rotates refresh token, returns new tokens |
| `/api/v1/auth/logout` | POST | JWT | Revokes all user refresh tokens |
| `/api/v1/auth/send-otp` | POST | Public | Generates 6-digit OTP (Redis-backed, 300s TTL) |
| `/api/v1/auth/verify-otp` | POST | Public | Validates OTP, marks email verified |

**Key Decisions**:
- Passwords hashed with bcrypt (12 rounds)
- OTP stored in Redis with 300s TTL (migrated from in-memory Map)
- Registration validates password strength and checks history via PasswordService
- JWT `signOptions.expiresIn` cast to `any` due to @nestjs/jwt v11 type changes

---

### 2. Users / Profile Module
**Files**: `src/modules/users/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/profile` | GET | Returns user + profile |
| `/api/v1/profile` | PUT | Updates user fields and upserts profile |
| `/api/v1/profile/memberships` | GET | Lists tenant memberships |
| `/api/v1/profile/consents` | GET | Lists consents with scopes |
| `/api/v1/profile/consents` | POST | Grants/updates consent with scopes |
| `/api/v1/profile/consents/:tenantId` | DELETE | Revokes consent |

**Key Decisions**:
- Profile upsert: updates user + profile in one call
- Consent uses `tenantId_userId` unique constraint (one consent per tenant pair)
- Version increment on each consent update for audit trail

---

### 3. IAM Module
**Files**: `src/modules/iam/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/devices` | POST | Register device (token, platform, deviceId) |
| `/api/v1/devices` | GET | List user's devices |
| `/api/v1/devices/:id` | PUT | Update device metadata |
| `/api/v1/devices/:id` | DELETE | Revoke device |
| `/api/v1/auth/forgot-password` | POST | Generate reset token (Redis, 1hr TTL) |
| `/api/v1/auth/reset-password` | POST | Reset password + revoke sessions |

**Key Decisions**:
- PasswordService validates strength (upper+lower+digit+special, 8+ chars)
- Password history keeps last 5 hashes to prevent reuse
- Recovery tokens stored in Redis with 1hr TTL
- Reset-password revokes all refresh tokens (sessions)

---

### 4. RBAC Module
**Files**: `src/modules/rbac/`, `src/common/guards/rbac.guard.ts`, `src/common/decorators/permissions.decorator.ts`

**Seed**: 4 roles (super_admin, support, operations, finance), 20 permissions

**Usage**:
```typescript
@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRole('super_admin')
@RequirePermission('tenant.*')
```

**Key Decisions**:
- Guard checks both role-based access and granular permission-based access
- Permissions use glob-like patterns (`tenant.*`, `user.read`, `order.write`)
- Built as `@Global()` module so available everywhere

---

### 5. Tenants Module
**Files**: `src/modules/tenants/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants` | POST | JWT | Create tenant + auto-join as owner |
| `/api/v1/tenants/my` | GET | JWT | List user's tenants |
| `/api/v1/tenants/:id` | GET | Public | Get tenant with theme, nav, counts |
| `/api/v1/tenants/:id` | PUT | JWT | Update tenant (owner only) |
| `/api/v1/tenants/:id/publish` | POST | JWT | Publish tenant, create default theme |

**Sub-modules**:

**TenantConfig** (`/api/v1/tenants/:id/config`):
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Get runtime config |
| PUT | `/config` | Set languages, currency, timezone, region, offlinePolicy |

**Subscription** (`/api/v1/tenants/:id`):
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/subscribe` | Subscribe to a plan (body: { planId }) |
| GET | `/subscription` | Current subscription with plan details |
| POST | `/cancel` | Cancel at period end |

**Features** (`/api/v1/tenants/:id/features`):
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/features` | Resolved feature flags from subscription plan |

**Key Decisions**:
- Ownership verified via private method
- Slug uniqueness enforced at DB level
- FeatureResolver merges plan features into a boolean map
- Subscription plans: Starter (free), Business ($29/mo), Enterprise ($99/mo)

---

### 6. Builder Module
**Files**: `src/modules/builder/`

Routes are nested under `/api/v1/tenants/:tenantId/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pages` | GET | List pages with sections + components |
| `/pages/:pageId` | PUT | Update page metadata |
| `/pages/:pageId/sections` | POST | Add section to page |
| `/sections/:sectionId` | PUT | Update section |
| `/sections/:sectionId/components` | POST | Add component to section |
| `/components/:componentId` | PUT | Update component |
| `/navigation` | GET | Get navigation config |
| `/navigation` | PUT | Upsert navigation |
| `/theme` | GET | Get theme config |
| `/theme` | PUT | Upsert theme |

**Key Decisions**:
- Data model: Page → Section → Component (hierarchical)
- Navigation and Theme are singleton per tenant (unique constraint on tenantId)

---

### 7. Gateway & BFF
**Files**: `src/gateway/`, `src/bff/`

**Gateway**: `/api/v1`
- GatewayRateLimiter — Redis-backed sliding window (configurable TTL + limit per tenant/IP)
- Global rate limit enforcement at the gateway level

**Mobile BFF** (`/api/v1/bff/mobile`):
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/manifest/:id` | GET | Tenant manifest (cached 5min in Redis), resolves by id or slug |
| `/discovery` | GET | Discovery feed with featured tenants + categories |
| `/profile` | GET | Aggregated user profile (profile + memberships + consents) |
| `/notifications` | GET | Notifications with unread count |
| `/catalog` | GET | Tenant product catalog (paginated, search, category filter) |

**Tenant Dashboard BFF** (`/api/v1/bff/tenant-dashboard`):
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/summary` | GET | Dashboard counts (pages, products, orders, bookings) |
| `/analytics` | GET | 30-day aggregates (revenue, orders, bookings) |
| `/integrations` | GET | Payment account connection status |

**Business Dashboard BFF** (`/api/v1/bff/business-dashboard`):
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/overview` | GET | Platform-wide stats (tenants, users, products, orders, revenue) |
| `/tenants` | GET | Paginated tenant list with subscription info |
| `/audit-logs` | GET | Recent audit log entries |

**Website BFF** (`/api/v1/bff/website`):
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/categories` | GET | Public vertical categories |
| `/featured` | GET | Featured tenants for landing page |
| `/pricing` | GET | Subscription plans with pricing |

---

### 8. Publishing Module
**Files**: `src/modules/publishing/`

| Endpoint (JWT) `/api/v1/tenants/:id/publishing` | Method | Description |
|----------|--------|-------------|
| `/validate` | POST | Validates draft completeness |
| `/publish` | POST | Validates + compiles + creates release |
| `/releases` | GET | Release history (sorted desc by buildNumber) |
| `/releases/:version` | GET | Specific release detail |
| `/rollback/:version` | POST | Rollback to a previous version |
| `/draft` | GET | Current draft state |

**ValidationEngine**: Checks pages exist, home page is set, no duplicate slugs, sections have components, theme and navigation are configured.

**ManifestCompiler**: Assembles SDUI JSON from tenant data (theme, navigation, config, features, pages→sections→components), generates SHA-256 checksum, auto-increments build version, creates Draft + Release records, emits `ReleasePublished` / `RollbackCompleted` events.

---

### 9. Media / DAM Module
**Files**: `src/modules/media/`

| Endpoint (JWT) `/api/v1/tenants/:tid/media` | Method | Description |
|----------|--------|-------------|
| `/upload` | POST | Upload file (auto-optimizes images) |
| `/` | GET | List media (filter by folderId) |
| `/:id` | GET | Media details |
| `/:id` | PATCH | Update metadata |
| `/:id` | DELETE | Delete + all variants |
| `/:id/cdn-url` | GET | CDN URL (?variant=thumbnail/small/medium/large/og-image) |
| `/folders` | POST | Create folder |
| `/folders` | GET | List folders with child/media counts |
| `/folders/:id` | PATCH | Update folder |
| `/folders/:id` | DELETE | Delete empty folder |

**ImageOptimizer**: Sharp-based pipeline:
- Webp conversion (quality 90)
- 5 preset variants: thumbnail (150x150), small (400w), medium (800w), large (1200w), og-image (1200x630)
- Skips enlargement; skips thumbnail for images < 150px
- Generates variants on upload, stored in `uploads/variants/`

**Key Decisions**:
- Hash-based dedup via UUID file naming
- Variant metadata stored as JSON on Media.variants
- AssetVersion tracks version history per upload
- CDN_URL env var for delivery URL generation

---

### 10. Commerce Module
**Files**: `src/modules/commerce/`

**Products & Categories**:
- Full CRUD with soft-delete (isActive flag)
- Paginated listing with categoryId/search/price range/sort filters
- Product images as separate table (replace on update)
- Product variants with stock/price/sku/attributes

**Cart Engine**:
- Create/get or create cart by userId or sessionId
- Add item (validates stock, increments qty for existing)
- Update quantity / remove item
- Apply/remove coupon with validation (expiry, usage limit, min spend)
- Auto-recalculate subtotal + discount + total

**Checkout**:
- Converts cart to order, expires cart
- Increments coupon usage count
- Copies cart items to order items
- Emits `OrderCreated` event

**Order Lifecycle**:
- Status transitions validated: `pending_payment → paid → processing → shipped → delivered → completed`
- Cancellation/refund allowed from most states
- Automatically sets `paidAt` / `fulfilledAt` timestamps
- OrderStatusHistory tracks all transitions
- Emits `OrderStatusChanged` event

**Coupons**: Percentage or fixed amount, minSpend, maxUses, expiry date, soft-delete.

**Fulfillments**: Create per order, track method/status/address, set completedAt on completion.

**Tax Rules**: Create with default handling, per-region rates, inclusive/exclusive type, calculation endpoint.

---

### 11. Booking Module
**Files**: `src/modules/booking/`

**Services**: Duration, capacity, pricing, optional staff assignment.

**Staff Members**: Name, role, working hours, buffer time, booking limit, service assignments via many-to-many.

**Resources**: Rooms/equipment with type and capacity.

**Schedules**: Recurring (dayOfWeek) or date-specific, linked to staff or resource.

**Availability Engine**:
- Generates time slots from schedules for a given date + service
- Detects conflicts with existing bookings (overlapping time ranges)
- Respects service capacity
- Accounts for staff-specific schedules when staffId is provided

**Booking Lifecycle**: 7 states with validated transitions:
```
requested → confirmed → in_progress → completed
     ↘ cancelled        ↘ no_show
     ↘ rescheduled → confirmed / cancelled
```

**Waiting List**: Add entry, list by service, mark notified.

**Events**: `BookingCreated`, `BookingStatusChanged`

---

### 12. Forms Module
**Files**: `src/modules/forms/`

**Form CRUD**: Create with fields (type, label, placeholder, required, options, validation rules, conditional logic), sections, config. Auto-increments version on update. Delete cascades fields, submissions, workflows.

**Validation Engine** (server-side):
- Required field check
- minLength / maxLength (string)
- min / max (numeric)
- Regex pattern match with custom error message
- Email format validation

**Submissions**: Submit with validation, pin form version, attach files. Emits `FormSubmitted` event.

**Approval Workflow**:
- Upsert multi-step workflow per form
- Approve/reject submissions
- Auto-calculates required approval count from workflow steps
- Transitions submission to `approved` / `rejected` status
- Emits `SubmissionApproved` event

---

### 13. Payments Module
**Files**: `src/modules/payments/`

**PaymentAdapter Interface**:
```typescript
interface PaymentAdapter {
  readonly provider: string;
  initializePayment(request): Promise<PaymentResponse>;
  verifyPayment(reference): Promise<VerifyResponse>;
  processWebhook(payload, signature): Promise<WebhookResult>;
}
```

**Adapters**:
- **PaystackAdapter** — REST client for `/transaction/initialize`, `/transaction/verify/:ref`, webhook signature verification, refunds, health check
- **FlutterwaveAdapter** — REST client for `/v3/payments`, `/transactions/verify_by_reference`, webhook parsing, refunds, health check
- **StripeAdapter** — Stripe Checkout Sessions API (hosted page, minimal PCI scope), webhook signature verification, refunds (partial/full), health check. Uses `STRIPE_SECRET_KEY` env var.

**PaymentsService**:
- `initializePayment`: Looks up tenant payment account, generates unique reference, creates PaymentIntent + PaymentTransaction, calls provider init API
- `verifyPayment`: Calls provider verify endpoint, updates intent + transaction status, creates FinancialEvent, emits `PaymentCompleted`
- `processWebhook`: Logs raw webhook to WebhookEvent table, processes via adapter, updates matching intents
- `processRefund`: Processes partial or full refunds with financial event recording
- `recordSettlement` / `confirmSettlement`: Manages Settlement records for payout tracking
- `getIntents`: Paginated listing with status/provider filters
- `healthCheck` / `healthCheckAll`: Provider health status endpoint

**Seed**: 3 payment providers (Flutterwave, Paystack, Stripe)

---

### 14. Notifications Module
**Files**: `src/modules/notifications/`

**In-App**: List with pagination and unread filter, mark read, mark all read, unread count.

**Dispatch Engine**:
- `sendPush`: Creates notification record, iterates user's active device tokens, sends via PushAdapter (Expo Push API / FCM HTTP v1 / APNS stub / log), tracks DeliveryResult with clickedAt/openedAt
- `sendEmail`: Creates notification record, sends via EmailAdapter (SendGrid/Resend/SES/SMTP/log), supports optional HTML body
- `sendSms`: Sends via SmsAdapter (Twilio/Termii/AfricaTalking/log)
- `sendFromTemplate`: Renders template body/subject with `{{variable}}` injection, generates HTML for email (`<p>${body}<br></p>`), dispatches via appropriate channel

**Campaigns**: Bulk dispatch to multiple users with channel selection, template rendering, optional scheduling (`scheduledAt`), and segmentation (`segment: { field, operator, value }` — pre-filters recipients by user fields like status/emailVerified before sending)

**Click Tracking**: `GET /notifications/analytics/click` returns total/read/unread/readRate per user or tenant. Each DeliveryResult tracks `openedAt` and `clickedAt` timestamps for analytics.

**Templates**: CRUD with name, type, channel, subject, body, variables array, locale, version tracking.

**Preferences**: Per user/channel/category/channel with enabled flag and quietHours, tenant-scoped.

**Device Tokens**: Register (upsert by token), unregister (deactivate), track platform and last used.

**Delivery Results**: Record per event per channel with provider, status, error message, delivered timestamp.

---

### 15. Renderer Module
**Files**: `src/modules/renderer/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants/:id/definition` | GET | Public | Full app definition JSON |
| `/api/v1/resolve/:slug` | GET | Public | Resolve tenant by slug for QR |

**Output**: Generates `{ tenantId, name, status, theme, navigation, screens }` JSON.

**Key Decisions**:
- Queries active pages/sections/components only
- Theme defaults provided if tenant has none
- This is the core SDUI contract — mobile app consumes this JSON

---

### 16-18. Templates, QR, Discovery, Admin Modules
**Files**: `src/modules/templates/`, `src/modules/qr/`, `src/modules/discovery/`, `src/modules/admin/`

**Templates**: 3 seed templates (Modern Store, Restaurant, Clinic) with pages/sections/components/navigation/theme as JSON. Non-destructive application.

**QR**: Generate QR metadata with deep-link format (`dukadesk://tenant/{slug}`), resolve slug to tenant.

**Discovery**: Featured tenants (last 10 published), case-insensitive search, 12 hardcoded categories, nearby stub.

**Admin**: Approve/suspend tenants, list all with status filter, platform stats. Uses RBAC guard.

---

## Phase 0 Infrastructure

### Event Bus (`src/shared/events/`)
- `EventBusService` — in-process pub/sub with sync (same tick) and async (next tick via `setImmediate` or queue) dispatch
- `DomainEvent` interface: `{ type, aggregateId, data, timestamp, correlationId }`
- Used by: Publishing, Commerce, Booking, Forms, Payments modules

### Tenant Context (`src/shared/context/`)
- `TenantContextService` — wraps AsyncLocalStorage, provides `get/set` for tenantId, userId
- `TenantResolverMiddleware` — extracts tenant from `x-tenant-id` header, slug subdomain, or domain lookup

### Redis (`src/common/redis/`)
- `RedisService` — ioredis wrapper with in-memory `Map` fallback when Redis is unavailable
- Used for: OTP store, rate limiter, cache (manifests, media lists), pub/sub

### Queue (`src/shared/queue/`)
- Bull/BullMQ with 5 queues: publishing, notifications, assets, webhooks, analytics
- `QueueService` — typed interface for adding jobs
- Queue names and options centralized in `QueueModule`

### Structured Logging (`src/common/logger/`)
- nestjs-pino with pino-pretty for development
- `LoggerService` wraps pino, auto-attaches `correlationId`, `tenantId`, `userId` context
- Correlation ID middleware generates/carries `x-correlation-id` header

### Health (`src/modules/health/`)
- `GET /health` — returns DB connectivity, uptime, timestamp, status

### RBAC (`src/modules/rbac/`)
- Role, Permission, RolePermission, UserRole models
- 4 seed roles, 20 seed permissions
- `RbacGuard` + `@RequireRole()` / `@RequirePermission()` decorators

---

## Database Schema

30+ models across 12 domains. Key relationships:

```
User
 ├── Profile (1:1)
 ├── RefreshToken (1:N)
 ├── Device (1:N)
 ├── PasswordHistory (1:N)
 ├── TenantUser (1:N) → Tenant
 ├── Consent (1:N) → Tenant
 ├── Notification (1:N)
 ├── NotificationPreference (1:N)
 └── NotificationEvent (1:N)

Tenant
 ├── TenantUser (1:N) → User
 ├── TenantConfig (1:1)
 ├── Subscription (1:1) → SubscriptionPlan
 ├── Page (1:N) → Section (1:N) → Component (1:N)
 ├── Navigation (1:1)
 ├── Theme (1:1)
 ├── AssetFolder (1:N)
 ├── Media (1:N) → AssetVersion (1:N)
 ├── Draft (1:1)
 ├── Release (1:N)
 ├── Category (1:N) → Product (1:N)
 │   ├── ProductImage (1:N)
 │   └── ProductVariant (1:N)
 ├── Cart (1:N) → CartItem (1:N)
 ├── Order (1:N) → OrderItem (1:N)
 │   ├── OrderStatusHistory (1:N)
 │   └── Fulfillment (1:N)
 ├── Coupon (1:N)
 ├── TaxRule (1:N)
 ├── BookingService (1:N) → Booking (1:N) → BookingHistory (1:N)
 │   └── StaffMember (M:N)
 ├── StaffMember (1:N) → Booking (1:N)
 ├── BookingResource (1:N) → Booking (1:N)
 ├── Schedule (1:N)
 ├── WaitingListEntry (1:N)
 ├── Form (1:N) → FormField (1:N)
 │   ├── FormSubmission (1:N) → FormApproval (1:N)
 │   └── FormWorkflow (1:1)
  ├── TenantPaymentAccount (1:N) → PaymentProvider
  ├── PaymentIntent (1:N) → PaymentTransaction (1:N)
  ├── Settlement (1:N)
  ├── FinancialEvent (1:N)
  ├── NotificationTemplate (1:N)
  ├── AuditLog (1:N)
  ├── IntegrationConnector (1:N) → OAuthToken / WebhookOutbox / SyncJob
  ├── AnalyticsEvent (1:N) / Dashboard / DashboardWidget / SavedReport
  ├── SearchIndex / SearchQuery / SearchSynonym
  ├── AIProvider / AIPrompt / AICompletion / AIEmbedding
  ├── PlatformSetting / SystemAnnouncement / FeatureFlag / ApiQuota
  ├── Deployment / Environment / HealthCheck / Backup
  ├── SecurityPolicy / ApiKey / SecurityEvent / ConsentAudit
  ├── DeveloperApp / WebhookEndpoint / WebhookEventLog
  ├── MarketplaceListing / PluginInstallation
  ├── AssetCollection / AssetCollectionItem / AssetShare / StorageProvider
  ├── BookingLocation / CancellationPolicy / BookingReminder
  ├── InventoryReservation
  └── DeliveryResult (clickedAt, openedAt)

Platform (no tenant):
 ├── SubscriptionPlan
 ├── PaymentProvider
 ├── Role / Permission / RolePermission
 ├── UserRole
 ├── WebhookEvent
 └── NotificationTemplate (platform-level templates)
```

---

## Architecture Patterns

### Guard Chain
1. `ThrottlerGuard` (global) — rate limiting
2. `CorrelationIdMiddleware` — request tracing
3. `TenantResolverMiddleware` — tenant context
4. `JwtAuthGuard` (per-route) — JWT validation
5. `RbacGuard` (per-route) — role/permission check
6. Ownership/tenant-scoped checks (in service layer)

### Request Lifecycle
```
Request → ThrottlerGuard → CorrelationId → TenantResolver → JwtAuthGuard → RbacGuard → ValidationPipe → Controller → Service → EventBus → Prisma → DB
```

### Response Pipeline
```
Controller → TransformInterceptor → { success, message, data }
Error → HttpExceptionFilter → { success, errors: [] }
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | API server port |
| `DATABASE_URL` | postgresql://dukadesk:dukadesk@localhost:5432/dukadesk | PostgreSQL connection |
| `JWT_SECRET` | super-secret-key-change-in-production | JWT signing key |
| `JWT_EXPIRATION` | 15m | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | 7d | Refresh token TTL |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `CDN_URL` | (empty) | CDN base URL for media delivery |
| `PAYSTACK_SECRET_KEY` | sk_test_... | Paystack API secret |
| `FLUTTERWAVE_SECRET_KEY` | FLWSECK_test_... | Flutterwave API secret |
| `STRIPE_SECRET_KEY` | sk_test_... | Stripe API secret |
| `EMAIL_PROVIDER` | log | Email provider: sendgrid/resend/ses/smtp/log |
| `EMAIL_API_KEY` | (empty) | SendGrid/Resend API key |
| `EMAIL_FROM_NAME` | DUKADESK | Sender name for emails |
| `EMAIL_FROM_EMAIL` | noreply@dukadesk.app | Sender email address |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | (empty) | SMTP credentials for `smtp` provider |
| `PUSH_PROVIDER` | log | Push provider: expo/fcm/apns/log |
| `FCM_SERVER_KEY` | (empty) | Firebase Cloud Messaging server key |
| `SMS_PROVIDER` | log | SMS provider: twilio/termii/africatalking/log |
| `SMS_API_KEY` / `SMS_API_SECRET` / `SMS_FROM` | (empty) | SMS provider credentials |
| `OPENAI_API_KEY` | (empty) | OpenAI API key (completions + embeddings) |
| `ANTHROPIC_API_KEY` | (empty) | Anthropic API key (Claude completions) |
| `CORS_ORIGINS` | * | Allowed origins |
| `THROTTLE_TTL` | 60 | Rate limit window (sec) |
| `THROTTLE_LIMIT` | 100 | Max requests per window |

---

## Seed Data

| Entity | Details |
|--------|---------|
| **Roles** | super_admin, support, operations, finance |
| **Permissions** | user.read, user.write, tenant.read, tenant.write, tenant.delete, role.read, role.write, content.read, content.write, content.publish, order.read, order.write, payout.read, payout.write, analytics.read, settings.read, settings.write, user.impersonate, audit.read, system.config |
| **Role-Permissions** | super_admin gets all 20 permissions |
| **Plans** | Starter (free, 1 staff, 1GB storage, 100 orders/mo, basic analytics), Business ($29/mo, 10 staff, 10GB, 1000 orders, advanced), Enterprise ($99/mo, unlimited) |
| **Providers** | Flutterwave, Paystack, Stripe |
| **Templates** | Modern Store, Restaurant, Clinic |
