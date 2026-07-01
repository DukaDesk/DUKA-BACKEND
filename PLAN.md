# DUKADESK Backend — Master Implementation Plan

> Covers all 12 PRD specifications. Each item is traceable to its source prompt.

---

## Phase 0 — Architectural Foundation

The bedrock every other module depends on. Build these first, in order.

### 0.1 Event Bus & Domain Events (`[Prompt 1]`)

- [ ] Create `src/shared/events/event-bus.service.ts` — lightweight in-process pub/sub
- [ ] Define base `DomainEvent` interface: `{ id, type, aggregateId, timestamp, data, correlationId }`
- [ ] Create typed event classes per domain (see Phase 1-2 for event lists)
- [ ] Add `@OnEvent()` decorator for handler registration
- [ ] Support sync (within request) and async (via queue) dispatch modes
- [ ] Add `EventBusModule` — global singleton

### 0.2 Tenant Context (`[Prompt 1, 3, 4]`)

- [ ] Create `src/common/interceptors/tenant-context.interceptor.ts`
- [ ] Resolve tenant from: `x-tenant-id` header, `x-tenant-slug` header, JWT claims, route param, domain
- [ ] Create `TenantContext` class: `{ tenantId, slug, subscription, features, config, locale }`
- [ ] Create `@TenantContext()` param decorator
- [ ] Add `TenantAwareGuard` that fails if tenant context missing on protected routes
- [ ] Propagate context through `ExecutionContext` and `ClsService` (continuation-local storage)

### 0.3 Redis Integration (`[Prompt 1, 2, 6, 12]`)

- [ ] Install `@nestjs/bull`, `bull`, `ioredis`
- [ ] Create `src/common/redis/redis.module.ts` — wrapper around ioredis
- [ ] Create `RedisOtpStore` — remove in-memory Map from auth service
- [ ] Create `RedisSessionStore` — session blacklisting, device tracking
- [ ] Create `RedisCacheService` — generic cache with TTL
- [ ] Create `RedisPubSubService` — cross-instance event broadcast (future)

### 0.4 Background Job Queue (`[Prompt 1, 6, 7, 11, 12]`)

- [ ] Create `src/shared/queue/queue.module.ts` — Bull/BullMQ wrapper
- [ ] Define queues:
  - `publishing` — manifest compilation, release generation, cache invalidation
  - `notifications` — push, email, SMS dispatch
  - `assets` — optimization, variant generation, virus scan
  - `webhooks` — payment and integration webhook processing
  - `analytics` — event aggregation and reporting
- [ ] Create base `AbstractJobProcessor` with retry, backoff, dead-letter handling

### 0.5 Structured Logging & Correlation IDs (`[Prompt 1, 4]`)

- [ ] Install `pino` + `nestjs-pino`
- [ ] Create `src/common/logger/logger.module.ts`
- [ ] Add `CorrelationIdMiddleware` — generates/carries `x-correlation-id`
- [ ] Include in all logs: `correlationId`, `tenantId`, `userId`, `module`, `action`
- [ ] Define log levels: `debug`, `info`, `warn`, `error`, `fatal`
- [ ] Add `LoggerService` wrapper class

### 0.6 Health Checks (`[Prompt 1, 4]`)

- [ ] Create `src/modules/health/health.controller.ts`
- [ ] Endpoint: `GET /health` — returns `{ status, uptime, db, redis, storage, version }`
- [ ] Integrate with `@nestjs/terminus` or custom health indicators
- [ ] Add `HealthModule` to app imports

### 0.7 Full RBAC System (`[Prompt 2, 3, 4]`)

#### Database Changes (`prisma/schema.prisma`)
- [ ] Add `Role` enum: `super_admin`, `support`, `operations`, `finance`
- [ ] Add `Permission` model: `{ id, name, resource, action, description }`
- [ ] Add `RolePermission` join table
- [ ] Add `UserRole` model: `{ userId, roleId, tenantId? }`
- [ ] Add `TenantPermission` model: `{ tenantUser, permission }`

#### Service & Guard
- [ ] Create `src/common/guards/rbac.guard.ts` — `@RequirePermission('tenant:update')`
- [ ] Create `@RequireRole()` and `@RequirePermission()` decorators
- [ ] Create `PermissionsService` — resolves effective permissions from user roles + tenant roles
- [ ] Seed initial roles & permissions in `prisma/seed.ts`

---

## Phase 1 — Core Platform Services

Build the platform engines that business modules depend on.

### 1.1 IAM Platform — Full Identity & Access (`[Prompt 2]`)

#### Device Management
- [ ] Add `Device` model to schema: `{ id, userId, platform, appVersion, pushToken, lastActive, name, trustStatus }`
- [ ] Create `DevicesController`: `POST /devices/register`, `PUT /devices/:id`, `DELETE /devices/:id`
- [ ] Add device-to-session mapping
- [ ] Support device revocation and lost-device handling

#### Password Policies
- [ ] Add password validation: min length (8), complexity (upper+lower+digit+special), history (last 5)
- [ ] Create `PasswordService` with hashing, validation, history tracking
- [ ] Add `PasswordHistory` model

#### Account Recovery
- [ ] `POST /auth/forgot-password` — sends reset link/OTP
- [ ] `POST /auth/reset-password` — validates token, updates password, revokes sessions
- [ ] Admin-assisted recovery for business accounts

#### Consent Enhancement
- [ ] Add consent categories: `basic_profile`, `email`, `phone`, `addresses`, `payment_refs`, `notification_prefs`, `order_history`, `booking_history`
- [ ] Add consent audit history — every grant/revoke is timestamped and recorded
- [ ] Add `POST /profile/consents/:id/history` — user-visible consent log

#### API Groups (IAM)
- [ ] `POST /auth/register` — registration with validation
- [ ] `POST /auth/login` — email+password authentication
- [ ] `POST /auth/refresh` — token rotation
- [ ] `POST /auth/logout` — revoke session + device
- [ ] `POST /auth/send-otp` — OTP dispatch (via Redis)
- [ ] `POST /auth/verify-otp` — OTP verification
- [ ] `POST /auth/forgot-password` — recovery initiation
- [ ] `POST /auth/reset-password` — password reset
- [ ] `POST /devices/register` — device registration
- [ ] `PUT /devices/:id` — update device metadata
- [ ] `DELETE /devices/:id` — revoke device
- [ ] `GET /profile` — user profile + settings
- [ ] `PUT /profile` — update profile
- [ ] `GET /profile/memberships` — list tenants
- [ ] `GET /profile/consents` — list consents
- [ ] `POST /profile/consents` — grant consent
- [ ] `DELETE /profile/consents/:tenantId` — revoke consent

#### Events Published
- [ ] `UserRegistered` — triggers welcome notification
- [ ] `UserVerified` — email/phone verified
- [ ] `UserLoggedIn` — device+session tracking
- [ ] `UserLoggedOut` — session cleanup
- [ ] `ConsentGranted` — tenant notified
- [ ] `ConsentRevoked` — tenant access removed
- [ ] `PasswordChanged` — session revocation
- [ ] `DeviceRegistered` — trust evaluation

---

### 1.2 Tenant & Workspace Platform (`[Prompt 3]`)

#### Runtime Configuration
- [ ] Add `TenantConfig` model: `{ tenantId, languages, currency, timezone, region, offlinePolicy, searchSettings, notificationPrefs, config (Json) }`
- [ ] Create `TenantConfigService` — CRUD with versioning
- [ ] Add to tenant context resolution
- [ ] Add `PUT /tenants/:id/config` — owner-only endpoint

#### Subscription Management
- [ ] Add `Plan` model: `{ id, name, slug, price, features (Json), limits (Json) }`
- [ ] Add `Subscription` model: `{ id, tenantId, planId, status, startDate, endDate, autoRenew }`
- [ ] Create `SubscriptionService` — subscribe, upgrade, downgrade, cancel, expire
- [ ] Add `FeatureFlagService` — resolves enabled features from subscription + tenant overrides
- [ ] Seed starter plans: `Starter`, `Business`, `Enterprise`

#### Feature Availability Resolution
- [ ] Create `FeatureResolver` — evaluated at runtime: `tenant.subscription.plan.features['commerce']`
- [ ] Feature flags: `commerce`, `booking`, `forms`, `messaging`, `analytics`, `integrations`, `custom_domain`, `multi_workspace`, `sso`
- [ ] Add `GET /tenants/:id/features` — returns available capabilities

#### Domain Management (scaffold for future)
- [ ] Add `TenantDomain` model: `{ id, tenantId, domain, verified, sslStatus, redirectTo, isPrimary }`
- [ ] Create `DomainService` — verify, SSL provision (stub), redirect management
- [ ] Add `POST /tenants/:id/domains`, `POST /tenants/:id/domains/:did/verify`

#### API Groups (Tenant)
- [ ] `POST /tenants` — create tenant
- [ ] `GET /tenants/my` — user's tenants
- [ ] `GET /tenants/:id` — tenant details
- [ ] `PUT /tenants/:id` — update
- [ ] `POST /tenants/:id/publish` — publish
- [ ] `GET /tenants/:id/config` — runtime config
- [ ] `PUT /tenants/:id/config` — update config
- [ ] `GET /tenants/:id/features` — enabled features
- [ ] `POST /tenants/:id/domains` — add domain
- [ ] `POST /tenants/:id/domains/:did/verify` — verify domain
- [ ] `POST /tenants/:id/members` — invite member
- [ ] `DELETE /tenants/:id/members/:userId` — remove member
- [ ] `PUT /tenants/:id/members/:userId` — change role
- [ ] `POST /tenants/:id/transfer` — transfer ownership

#### Events Published
- [ ] `TenantCreated` — triggers default setup
- [ ] `TenantPublished` — triggers manifest compilation
- [ ] `MemberInvited` — sends invitation
- [ ] `MemberJoined` — updates workspace
- [ ] `MemberRemoved` — revokes access
- [ ] `SubscriptionChanged` — feature re-evaluation
- [ ] `RuntimeConfigUpdated` — cache invalidation

---

### 1.3 API Gateway & BFF (`[Prompt 4]`)

#### Gateway Middleware
- [ ] Create `src/gateway/` directory structure
- [ ] Middleware chain (in order):
  1. `CorrelationIdMiddleware`
  2. `TenantResolverMiddleware`
  3. `AuthMiddleware` — JWT validation
  4. `RbacMiddleware` — permission check
  5. `RateLimitMiddleware` — per-user, per-tenant, per-endpoint
  6. `RequestValidatorMiddleware` — body size, content-type, schema
  7. `RequestLoggerMiddleware` — structured log every request

#### BFF Layer Structure
- [ ] `src/bff/mobile/` — aggregated endpoints for mobile (small payloads, manifest delivery)
- [ ] `src/bff/tenant-dashboard/` — builder workflows, publishing, analytics
- [ ] `src/bff/business-dashboard/` — admin operations, reporting
- [ ] `src/bff/website/` — public content, SEO, marketing

#### BFF: Mobile BFF
- [ ] `GET /bff/mobile/tenant/:slug/manifest` — aggregated app definition with cache headers
- [ ] `GET /bff/mobile/tenant/:slug/discovery` — featured + categories + nearby
- [ ] `POST /bff/mobile/checkout` — aggregated checkout (cart validate + payment intent + order create)
- [ ] `GET /bff/mobile/profile` — user profile + consents + memberships
- [ ] `GET /bff/mobile/notifications` — inbox with unread count

#### BFF: Tenant Dashboard BFF
- [ ] `GET /bff/tenant/:id/builder/summary` — page count, component count, publish status
- [ ] `POST /bff/tenant/:id/publish` — aggregated publish (validate + compile + release)
- [ ] `GET /bff/tenant/:id/analytics/summary` — visits, orders, bookings
- [ ] `GET /bff/tenant/:id/integrations/status` — connected providers

#### BFF: Business Dashboard BFF
- [ ] `GET /bff/admin/overview` — aggregated platform stats
- [ ] `GET /bff/admin/tenants` — paginated with status filter + _count
- [ ] `GET /bff/admin/alerts` — recent audit events

#### BFF: Website BFF
- [ ] `GET /bff/website/categories` — discover categories
- [ ] `GET /bff/website/featured` — featured tenants
- [ ] `POST /bff/website/auth/*` — proxied auth endpoints

#### Response Aggregation
- [ ] Create `AggregatorService` — runs multiple queries in parallel via `Promise.all`
- [ ] Support partial responses (sparse field selection via `?fields=`)
- [ ] Pagination normalization — consistent `{ data, meta: { page, limit, total, pages } }`

#### Caching
- [ ] `CacheService` — Redis-backed with per-tenant TTL
- [ ] Cache manifest responses (invalidated on publish)
- [ ] Cache public discovery endpoints (short TTL)
- [ ] Cache tenant config (medium TTL, invalidated on update)

---

### 1.4 Publishing Pipeline & Release Management (`[Prompt 6]`)

#### Database Changes
- [ ] Add `Release` model: `{ id, tenantId, version, buildNumber, manifest (Json), themeBundle (Json), assetManifest (Json), capabilityMeta (Json), checksum, status, channel, releaseNotes, publishedAt }`
- [ ] Add `Draft` model: `{ id, tenantId, version, manifest, status, createdAt }`
- [ ] Add `ValidationReport` model: `{ id, draftId, passed, errors (Json), warnings (Json), checkedAt }`

#### Validation Engine
- [ ] Create `src/modules/publishing/validation/` directory
- [ ] Validators:
  - `SchemaValidator` — screen schemas match component registry
  - `NavigationValidator` — all routes resolve, no dead links
  - `AssetValidator` — all referenced assets exist
  - `CapabilityValidator` — required capabilities are enabled
  - `ActionValidator` — all actions reference valid targets
  - `BindingValidator` — data bindings resolve to valid sources
- [ ] Return `{ passed: boolean, errors: ValidationError[], warnings: string[] }`

#### Manifest Compiler
- [ ] Create `ManifestCompiler` — transforms Draft → Release manifest
- [ ] Compilation steps:
  1. Merge tenant config into manifest
  2. Resolve capability contributions (screens, nav entries, permissions)
  3. Compile theme tokens into optimized bundle
  4. Generate asset manifest with checksums and CDN URLs
  5. Generate navigation tree
  6. Apply runtime feature flags
- [ ] Output deterministic manifest (same input → same output, hash-verified)

#### Release Management
- [ ] `ReleaseService` — `createRelease()`, `getRelease()`, `listReleases()`, `rollback()`
- [ ] Version format: `{major}.{minor}.{patch}` auto-incremented
- [ ] Release channels: `development`, `preview`, `production`
- [ ] Rollback: current → select previous → invalidate cache → notify clients
- [ ] Cache invalidation: Redis cache keys + CDN purge (stub) + ETag update

#### API Groups
- [ ] `POST /tenants/:id/publishing/validate` — validate current draft
- [ ] `POST /tenants/:id/publishing/publish` — compile + release
- [ ] `GET /tenants/:id/publishing/releases` — release history
- [ ] `GET /tenants/:id/publishing/releases/:version` — release detail
- [ ] `POST /tenants/:id/publishing/rollback/:version` — rollback
- [ ] `GET /tenants/:id/publishing/draft` — current draft state

#### Events Published
- [ ] `PublishRequested` — triggers validation
- [ ] `ValidationSucceeded` — proceeds to compilation
- [ ] `ValidationFailed` — blocks publish, notifies author
- [ ] `ManifestCompiled` — release ready
- [ ] `ReleasePublished` — triggers CDN invalidation + client notification
- [ ] `RollbackCompleted` — cache purge + client sync

---

### 1.5 Asset Management & DAM (`[Prompt 7]`)

#### Database Changes
- [ ] Add `AssetFolder` model: `{ id, tenantId, name, parentId, sortOrder }`
- [ ] Add `AssetVersion` model: `{ id, assetId, version, fileSize, hash, storagePath, cdnUrl, metadata (Json), createdAt }`
- [ ] Add `AssetPermission` model: `{ id, assetId, role, permission }`
- [ ] Extend `Media` model with: `hash, variants (Json), folderId, visibility, tags (String[])`

#### Storage Abstraction
- [ ] Create `StorageProvider` interface: `upload(file, path)`, `delete(path)`, `getSignedUrl(path, expiry)`, `exists(path)`
- [ ] Implement `LocalStorageProvider` (existing, refactor)
- [ ] Implement `S3StorageProvider` — AWS S3 / Cloudflare R2
- [ ] Swap via `STORAGE_PROVIDER` env var

#### Upload Pipeline
- [ ] `POST /tenants/:tid/media/upload` → validation → virus scan (stub) → optimization → variant generation → metadata extraction → storage → DB record
- [ ] Support single, batch, and chunked uploads

#### Optimization Pipeline
- [ ] Install `sharp` for image processing
- [ ] Pipeline steps:
  1. Validate MIME type + size + corruption
  2. Strip EXIF metadata
  3. Generate WebP variant
  4. Generate thumbnails: `{ thumbnail: 150x150, small: 300x300, medium: 600x600, large: 1200x1200, original }`
  5. Compress with quality tiers
- [ ] Video (future): transcode to HLS, generate poster frame

#### Variant Generation
- [ ] Deterministic variant URLs: `/assets/{id}/thumbnail`, `/assets/{id}/medium`
- [ ] Cache variants in Redis with CDN-aware TTL
- [ ] Generate on first access (lazy) or eagerly on upload

#### Asset Organization
- [ ] API: `POST /tenants/:tid/media/folders`, `GET /tenants/:tid/media/folders`, `PUT /folders/:id`
- [ ] List assets with folder hierarchy
- [ ] Tagging: `POST /media/:id/tags`, `GET /media/search?tag=food`

#### Permissions
- [ ] Visibility levels: `public`, `authenticated`, `tenant`, `private`
- [ ] Signed URLs for private assets with expiry
- [ ] Role-based access control on asset operations

#### API Groups
- [ ] `POST /tenants/:tid/media/upload` — single upload
- [ ] `POST /tenants/:tid/media/upload/batch` — batch upload
- [ ] `GET /tenants/:tid/media` — list assets with folder/filter
- [ ] `GET /media/:id` — asset detail with variants
- [ ] `GET /media/:id/variants/:variant` — specific variant
- [ ] `DELETE /media/:id` — soft-delete
- [ ] `POST /media/:id/restore` — restore
- [ ] `POST /tenants/:tid/media/folders` — create folder
- [ ] `PUT /folders/:id` — rename/move folder
- [ ] `DELETE /folders/:id` — delete folder
- [ ] `PUT /media/:id/permissions` — set visibility

#### Events Published
- [ ] `AssetUploaded` — triggers optimization pipeline
- [ ] `AssetOptimized` — variant generation complete
- [ ] `AssetDeleted` — CDN invalidation
- [ ] `AssetRestored` — re-publish
- [ ] `AssetPublished` — included in manifest

---

## Phase 2 — Business Domain Engines

These are the revenue-generating capabilities that tenants pay for.

### 2.1 Commerce — Full Catalog, Cart & Order Management (`[Prompt 8]`)

#### Database Changes
- [ ] Add `Cart` model: `{ id, tenantId, userId, sessionId, items (Json), couponCode, subtotal, total, expiresAt }`
- [ ] Add `CartItem` model: `{ id, cartId, productId, variantId, quantity, unitPrice, totalPrice }`
- [ ] Add `Order` model: `{ id, tenantId, userId, items (Json), status, subtotal, taxTotal, deliveryTotal, discountTotal, total, currency, paymentStatus, paymentIntentId, notes, placedAt, paidAt, fulfilledAt }`
- [ ] Add `OrderItem` model: `{ id, orderId, productId, variantId, name, quantity, unitPrice, totalPrice }`
- [ ] Add `OrderStatusHistory` model: `{ id, orderId, from, to, changedBy, reason }`
- [ ] Add `Coupon` model: `{ id, tenantId, code, type (percent/fixed), value, minSpend, maxUses, usedCount, expiresAt, isActive }`
- [ ] Add `Fulfillment` model: `{ id, orderId, method (pickup/delivery/courier), status, address, notes, scheduledAt, completedAt }`
- [ ] Add `TaxRule` model: `{ id, tenantId, name, rate, type (inclusive/exclusive), region, isDefault }`
- [ ] Add `ProductVariant` model: `{ id, productId, name, sku, price, compareAtPrice, stock, images (Json), attributes (Json), isActive }`

#### Catalog Enhancement
- [ ] Support unified catalog: `type` field on Product — `physical`, `service`, `digital`, `donation`, `membership`, `event_ticket`
- [ ] Variants: size/color/style with independent price + inventory + SKU
- [ ] Categories: nested hierarchy with image + description + sortOrder

#### Pricing Engine
- [ ] `PricingService` — calculates price with discounts, coupons, tax
- [ ] Support: fixed price, discounted, promotional (scheduled), multi-currency (future)
- [ ] Price always stored in tenant's default currency

#### Inventory Engine
- [ ] `InventoryService` — stock levels, reservations, adjustments, low-stock alerts
- [ ] Transactional: reserve on cart add, release on expiry, deduct on order
- [ ] Support unlimited stock mode

#### Cart Engine
- [ ] `CartService` — create, add item, update qty, remove, apply coupon, clear
- [ ] Per-tenant cart (one per tenant per user)
- [ ] Guest carts (session-based, future merge on login)
- [ ] Cart persistence: Redis for active carts, DB for long-lived

#### Checkout
- [ ] `CheckoutService` — validate inventory → validate coupon → calculate tax → calculate delivery → create payment intent → create order
- [ ] Steps:
  1. Validate cart (items exist, in stock, prices match)
  2. Validate coupon (code, usage, min spend, expiry)
  3. Calculate tax (tenant rules)
  4. Calculate delivery (tenant methods)
  5. Create Order (status: `pending_payment`)
  6. Create Payment Intent (via Payment Platform)
  7. Return payment session URL/data

#### Order Management
- [ ] Lifecycle: `pending_payment` → `paid` → `processing` → `ready` → `shipped` → `delivered` → `completed`
- [ ] Alternative: `cancelled`, `refunded` (future)
- [ ] Immutable orders with `OrderStatusHistory` for audit trail

#### Fulfillment
- [ ] Methods: `pickup`, `local_delivery`, `courier`, `digital`
- [ ] `FulfillmentService` — create, update status, track
- [ ] Independent of payment status (can deliver before payment if configured)

#### Coupons & Promotions
- [ ] Types: `percentage`, `fixed_amount`, `free_delivery`
- [ ] Validation: active, within dates, min spend, max uses, per-customer limit
- [ ] Apply during checkout, track usage

#### Tax Engine
- [ ] Per-tenant configurable rules
- [ ] Inclusive (tax included in price) vs exclusive (tax added at checkout)
- [ ] Regional tax rates
- [ ] Tax exemptions per product category

#### API Groups
- [ ] `GET /tenants/:tid/cart` — current cart
- [ ] `POST /tenants/:tid/cart/items` — add item
- [ ] `PUT /cart/items/:id` — update quantity
- [ ] `DELETE /cart/items/:id` — remove item
- [ ] `POST /tenants/:tid/cart/coupon` — apply coupon
- [ ] `DELETE /tenants/:tid/cart/coupon` — remove coupon
- [ ] `POST /tenants/:tid/checkout` — create order + payment intent
- [ ] `GET /orders/my` — user's orders
- [ ] `GET /orders/:id` — order detail with status history
- [ ] `POST /orders/:id/cancel` — cancel order
- [ ] `GET /tenants/:tid/orders` — tenant's orders (staff)
- [ ] `PUT /orders/:id/status` — update fulfillment status
- [ ] `GET /tenants/:tid/products/:id/variants` — list variants
- [ ] `POST /tenants/:tid/products/:id/variants` — create variant
- [ ] `PUT /variants/:id` — update variant
- [ ] `DELETE /variants/:id` — delete variant
- [ ] `PUT /products/:id/inventory` — adjust stock
- [ ] `GET /tenants/:tid/coupons` — list coupons
- [ ] `POST /tenants/:tid/coupons` — create coupon
- [ ] `PUT /coupons/:id` — update coupon
- [ ] `DELETE /coupons/:id` — delete coupon
- [ ] `GET /tenants/:tid/taxes` — list tax rules
- [ ] `POST /tenants/:tid/taxes` — create tax rule

#### Events Published
- [ ] `CartUpdated` — sync across devices
- [ ] `CheckoutStarted` — begin payment flow
- [ ] `OrderCreated` — trigger notification
- [ ] `OrderPaid` — trigger fulfillment
- [ ] `OrderCancelled` — release inventory
- [ ] `InventoryAdjusted` — low stock alerts
- [ ] `FulfillmentStarted` — notify customer
- [ ] `OrderDelivered` — collect feedback

---

### 2.2 Booking & Scheduling Engine (`[Prompt 9]`)

#### Database Changes
- [ ] Add `BookingService` model: `{ id, tenantId, name, description, duration, capacity, price, currency, categoryId, isActive }`
- [ ] Add `StaffMember` model: `{ id, tenantId, userId, name, role, services (String[]), workingHours (Json), bufferTime, bookingLimit, isActive }`
- [ ] Add `BookingResource` model: `{ id, tenantId, name, type (room/table/equipment/vehicle), capacity, isActive }`
- [ ] Add `Schedule` model: `{ id, tenantId, staffId?, resourceId?, dayOfWeek, startTime, endTime, isRecurring, date, isActive }`
- [ ] Add `Booking` model: `{ id, tenantId, serviceId, staffId, resourceId, userId, customerName, customerEmail, customerPhone, startTime, endTime, status, notes, paymentStatus, paymentIntentId, createdAt }`
- [ ] Add `BookingHistory` model: `{ id, bookingId, from, to, changedBy, reason }`
- [ ] Add `WaitingListEntry` model: `{ id, tenantId, serviceId, userId, requestedDate, requestedTime, notified, createdAt }`

#### Service Management
- [ ] `BookingServiceService` — CRUD for bookable services
- [ ] Each service has: duration, capacity, assigned staff, required resources, pricing (optional), booking rules, cancellation rules

#### Availability Engine
- [ ] `AvailabilityService` — computes available slots dynamically
- [ ] Inputs: working hours, holidays, existing bookings, staff leave, resource availability, capacity, buffer times
- [ ] Output: time slots with `{ startTime, endTime, staffId?, resourceId?, available }`
- [ ] Generated fresh per request (not pre-stored)

#### Time Slot Generation
- [ ] Slot interval = service duration + buffer time
- [ ] Example: 30min service + 15min buffer → slots at 09:00, 09:45, 10:30
- [ ] Prevent overlaps using conflict detection

#### Conflict Detection
- [ ] Check conflicts for: staff (double-booking), resource (room already taken), customer (existing booking at same time)
- [ ] Reject conflicting bookings with clear error messages

#### Booking Workflow
- [ ] States: `requested` → `pending_approval` → `confirmed` → `checked_in` → `completed`
- [ ] Alternative: `cancelled`, `no_show`, `rejected`, `rescheduled`
- [ ] Configurable per tenant (auto-confirm vs manual approval)

#### Recurring Bookings
- [ ] Patterns: daily, weekly, monthly, custom
- [ ] Support end date, max occurrences, exceptions

#### Reminder Engine
- [ ] `ReminderService` — schedule reminders before booking
- [ ] Channels: push, email, SMS (future)
- [ ] Configurable timing per tenant (e.g., 24h, 2h, 30min before)

#### Waiting List
- [ ] When confirmed booking cancelled, notify next waiting customer
- [ ] Reserve slot for configurable time (e.g., 30min)

#### Payment Integration
- [ ] Booking does not process payments directly
- [ ] Integration points: `deposit_required`, `pay_after`, `pay_on_arrival`, `free`
- [ ] Payment via Payment Platform when deposit/upfront required

#### API Groups
- [ ] `GET /tenants/:tid/booking/services` — list services
- [ ] `POST /tenants/:tid/booking/services` — create service
- [ ] `PUT /booking/services/:id` — update service
- [ ] `DELETE /booking/services/:id` — deactivate service
- [ ] `GET /tenants/:tid/booking/staff` — list staff
- [ ] `POST /tenants/:tid/booking/staff` — add staff
- [ ] `PUT /booking/staff/:id` — update staff
- [ ] `DELETE /booking/staff/:id` — remove staff
- [ ] `GET /tenants/:tid/booking/resources` — list resources
- [ ] `POST /tenants/:tid/booking/schedules` — set schedule
- [ ] `GET /tenants/:tid/booking/availability?serviceId=&date=` — time slots
- [ ] `POST /tenants/:tid/booking` — create booking
- [ ] `GET /booking/:id` — booking detail
- [ ] `POST /booking/:id/cancel` — cancel booking
- [ ] `POST /booking/:id/reschedule` — reschedule
- [ ] `PUT /booking/:id/check-in` — mark checked in
- [ ] `GET /tenants/:tid/booking/queue` — waiting list
- [ ] `POST /tenants/:tid/booking/queue` — join waiting list

#### Events Published
- [ ] `ServiceCreated` — available for booking
- [ ] `AvailabilityChanged` — slot regeneration
- [ ] `BookingRequested` — notification to staff
- [ ] `BookingConfirmed` — customer notification
- [ ] `BookingCancelled` — waiting list trigger
- [ ] `BookingRescheduled` — resource reallocation
- [ ] `ReminderSent` — tracking
- [ ] `CustomerCheckedIn` — status update

---

### 2.3 Forms & Workflow Engine (`[Prompt 10]`)

#### Database Changes
- [ ] Add `Form` model: `{ id, tenantId, name, description, category, sections (Json), config (Json), status (draft/published/archived), version, createdAt, updatedAt }`
- [ ] Add `FormField` model: `{ id, formId, sectionIndex, type, label, placeholder, required, options (Json), validation (Json), conditionalLogic (Json), sortOrder }`
- [ ] Add `FormSubmission` model: `{ id, formId, formVersion, tenantId, userId, answers (Json), status, workflowState, attachments (String[]), submittedAt }`
- [ ] Add `FormApproval` model: `{ id, submissionId, approverId, action (approved/rejected/returned), comment, actedAt }`
- [ ] Add `FormWorkflow` model: `{ id, formId, steps (Json), isActive }`

#### Schema Engine
- [ ] Form schema: `{ sections: [{ title, fields: [{ type, label, validation, conditional }] }] }`
- [ ] Server-side schema validation matches client-side rules
- [ ] Schemas are versioned — submissions linked to schema version

#### Field Library
- [ ] Basic: `text`, `textarea`, `email`, `phone`, `number`, `password`
- [ ] Choice: `checkbox`, `radio`, `toggle`, `dropdown`, `multi_select`
- [ ] DateTime: `date`, `time`, `datetime`
- [ ] Upload: `image_upload`, `file_upload`, `camera`
- [ ] Advanced: `signature`, `rating`, `slider`, `location_picker`, `qr_scanner`
- [ ] Layout: `section`, `divider`, `heading`, `spacer`

#### Conditional Logic
- [ ] Conditions: `if field == value → show/hide field/section`
- [ ] Support: equals, not equals, greater than, less than, contains, empty, not empty
- [ ] Nested conditions and multi-rule groups (AND/OR)

#### Validation Engine
- [ ] Runs server-side for every submission
- [ ] Rules: required, minLength, maxLength, min, max, regex, email, phone, fileSize, fileType
- [ ] Returns `{ valid: boolean, errors: { fieldId: string, message: string }[] }`

#### Workflow Engine
- [ ] Configurable states: `submitted` → `pending_review` → `approved` → `completed`
- [ ] Alternative: `rejected`, `returned_for_revision`, `escalated`, `archived`
- [ ] `WorkflowService` — transitions, validations, notifications

#### Approval Engine
- [ ] Single approver, multi-level, sequential, or parallel
- [ ] Every approval action audited
- [ ] Notifications on approval request and decision

#### Digital Signatures
- [ ] Capture: finger signature (canvas), stylus
- [ ] Store as immutable image, hash-verified
- [ ] Include in submission payload

#### Offline Support
- [ ] Form schema cached locally by mobile runtime
- [ ] Submission queue: store locally → sync on connectivity → server validates → return result
- [ ] Conflict detection for stale form versions

#### API Groups
- [ ] `GET /tenants/:tid/forms` — list forms
- [ ] `POST /tenants/:tid/forms` — create form
- [ ] `GET /forms/:id` — form detail with schema
- [ ] `PUT /forms/:id` — update form
- [ ] `POST /forms/:id/publish` — publish
- [ ] `DELETE /forms/:id` — archive
- [ ] `POST /forms/:id/submit` — submit response
- [ ] `GET /submissions/:id` — submission detail
- [ ] `GET /forms/:id/submissions` — list submissions
- [ ] `POST /forms/:id/workflow` — set workflow
- [ ] `POST /submissions/:id/approve` — approve
- [ ] `POST /submissions/:id/reject` — reject
- [ ] `POST /submissions/:id/return` — return for revision
- [ ] `POST /submissions/:id/sign` — add signature

#### Events Published
- [ ] `FormCreated` — available for submission
- [ ] `FormPublished` — schema versioned
- [ ] `SubmissionReceived` — workflow start
- [ ] `SubmissionValidated` — pass/fail
- [ ] `ApprovalRequested` — notification to approver
- [ ] `SubmissionApproved` — workflow continue
- [ ] `SubmissionRejected` — notify submitter
- [ ] `WorkflowCompleted` — final state

---

### 2.4 Payment Integration & Financial Orchestration (`[Prompt 11]`)

#### Database Changes
- [ ] Add `PaymentProvider` model: `{ id, name, slug, isActive }`
- [ ] Add `TenantPaymentAccount` model: `{ id, tenantId, providerId, livePublicKey (encrypted), liveSecretKey (encrypted), webhookSecret (encrypted), sandboxPublicKey, sandboxSecretKey, environment (sandbox/live), isDefault, status (active/disabled), metadata (Json) }`
- [ ] Add `PaymentIntent` model: `{ id, tenantId, accountId, provider, externalId, amount, currency, status, customer, metadata (Json), createdAt }`
- [ ] Add `PaymentTransaction` model: `{ id, intentId, type (charge/refund), externalRef, amount, fees, netAmount, providerResponse (Json), status, createdAt }`
- [ ] Add `WebhookEvent` model: `{ id, provider, eventType, rawPayload, verified, processed, processingAttempts, lastError, receivedAt }`
- [ ] Add `FinancialEvent` model: `{ id, tenantId, type, amount, currency, transactionId, orderId?, bookingId?, metadata (Json), occurredAt }`

#### Provider Adapter Interface
- [ ] `PaymentProviderAdapter`: `createPayment(dto)`, `verifyPayment(reference)`, `cancelPayment(ref)`, `refundPayment(ref, amount)`, `validateWebhook(payload, signature)`, `healthCheck()`

#### Implemented Adapters
- [ ] `FlutterwaveAdapter` — Flutterwave v3 API
- [ ] `PaystackAdapter` — Paystack v3 API
- [ ] `StripeAdapter` (future)
- [ ] Each adapter in its own directory under `src/modules/payments/adapters/`

#### Tenant Payment Accounts
- [ ] `POST /tenants/:tid/payments/accounts` — connect provider account (encrypt keys)
- [ ] `GET /tenants/:tid/payments/accounts` — list connected accounts
- [ ] `PUT /payment/accounts/:id` — update credentials
- [ ] `DELETE /payment/accounts/:id` — disconnect
- [ ] Support sandbox/live environment toggle

#### Payment Intent Lifecycle
- [ ] `createPaymentIntent(amount, currency, metadata)` → resolves tenant provider → creates provider session → stores intent → returns session URL/data
- [ ] Steps: `created` → `pending` → `authorized` → `paid` | `failed` | `cancelled` | `expired`
- [ ] Intents expire after configurable timeout

#### Webhook Processing
- [ ] `WebhookController` — single endpoint per provider: `POST /payments/webhooks/:provider`
- [ ] Verify signature using provider-specific algorithm
- [ ] Idempotency: deduplicate by webhook ID
- [ ] Process asynchronously via queue
- [ ] Dead-letter queue for failed processing
- [ ] Log all webhook events immutably

#### Transaction Recording
- [ ] Every payment attempt creates a `PaymentTransaction`
- [ ] `FinancialEvent` log for audit and reconciliation
- [ ] Transactions are immutable

#### Commerce Integration
- [ ] Checkout calls `PaymentPlatformService.createPaymentIntent()`
- [ ] On webhook `payment.succeeded` → `CommerceService.confirmOrder(orderId)`
- [ ] On webhook `payment.failed` → `CommerceService.failPayment(orderId)`

#### Booking Integration
- [ ] Booking calls `PaymentPlatformService.createPaymentIntent()` when deposit required
- [ ] Booking confirmed only after payment success
- [ ] Pay-on-arrival skips payment step

#### API Groups
- [ ] `GET /payments/providers` — list supported providers
- [ ] `POST /tenants/:tid/payments/accounts` — connect account
- [ ] `GET /tenants/:tid/payments/accounts` — list accounts
- [ ] `PUT /payment/accounts/:id` — update
- [ ] `DELETE /payment/accounts/:id` — disconnect
- [ ] `POST /payment/intents` — create payment intent
- [ ] `GET /payment/intents/:id` — intent status
- [ ] `POST /payment/intents/:id/cancel` — cancel
- [ ] `GET /tenants/:tid/payments/transactions` — transaction history
- [ ] `POST /payments/webhooks/:provider` — provider webhook endpoint

#### Events Published
- [ ] `PaymentIntentCreated` — awaiting completion
- [ ] `PaymentSucceeded` — trigger order/booking confirmation
- [ ] `PaymentFailed` — notify user
- [ ] `PaymentCancelled` — release holds
- [ ] `WebhookReceived` — raw event logged
- [ ] `TransactionUpdated` — financial event recorded

---

### 2.5 Notification & Communication Platform (`[Prompt 12]`)

#### Database Changes
- [ ] Add `NotificationTemplate` model: `{ id, tenantId, name, type, channel, subject, body, variables (String[]), locale, isActive, version }`
- [ ] Add `NotificationEvent` model: `{ id, tenantId, userId, type, channel, templateId, data (Json), status (queued/sent/delivered/failed), priority, createdAt }`
- [ ] Add `NotificationPreference` model: `{ id, userId, tenantId?, channel (push/email/sms), category, enabled, quietHours (Json) }`
- [ ] Add `DeviceToken` model: `{ id, userId, deviceId, platform, token, isActive, lastUsed }`
- [ ] Add `DeliveryResult` model: `{ id, eventId, channel, provider, status, providerMessageId, error, deliveredAt }`

#### Channel Adapter Interface
- [ ] `NotificationChannelAdapter`: `send(event, recipient) → DeliveryResult`, `healthCheck()`

#### Implemented Adapters
- [ ] `PushAdapter` — Expo Push API / FCM
- [ ] `EmailAdapter` — SendGrid / SES / Resend
- [ ] `InAppAdapter` — persist to `Notification` table
- [ ] `SmsAdapter` (future) — Twilio / Termii
- [ ] Each adapter in `src/modules/notifications/adapters/`

#### Template Engine
- [ ] `TemplateService` — render template with variables
- [ ] Support: `{{firstName}}`, `{{orderNumber}}`, `{{bookingTime}}`
- [ ] Locale-aware (per-user language preference)
- [ ] Branding applied: tenant logo, colors, business name
- [ ] Template types: `transactional`, `informational`, `reminder`, `administrative`, `marketing` (future)
- [ ] Tenant-scoped templates with fallback to platform defaults

#### Preference Engine
- [ ] `PreferenceService` — evaluate notification eligibility
- [ ] Checks: channel enabled, category enabled, quiet hours, marketing consent
- [ ] Per-tenant and global preferences
- [ ] Integrated with Identity consent model

#### Routing Engine
- [ ] Preferred channel → fallback channel on failure → retry → dead-letter
- [ ] Example: push → fail → email → fail → retry queue
- [ ] Configurable per notification type

#### Delivery Queue
- [ ] All notifications dispatched asynchronously via `Bull` queue
- [ ] Priority levels: `high` (OTP, password reset), `normal` (order confirm), `low` (marketing)
- [ ] Retry with exponential backoff (max 3 attempts)
- [ ] Dead-letter queue for permanently failed deliveries

#### Scheduling
- [ ] Immediate delivery
- [ ] Scheduled/delayed delivery (e.g., reminder 24h before booking)
- [ ] Recurring reminders (e.g., weekly report)

#### Read Tracking
- [ ] `InAppAdapter` tracks: delivered → opened → read → dismissed → clicked
- [ ] Deep link handling via metadata in notification payload
- [ ] Analytics feed from notification events

#### API Groups
- [ ] `GET /notifications` — inbox (paginated)
- [ ] `GET /notifications/unread-count` — badge count
- [ ] `PUT /notifications/:id/read` — mark read
- [ ] `PUT /notifications/read-all` — mark all read
- [ ] `PUT /notifications/:id/dismiss` — dismiss
- [ ] `GET /notifications/preferences` — user preferences
- [ ] `PUT /notifications/preferences` — update preferences
- [ ] `GET /tenants/:tid/notifications/templates` — list templates
- [ ] `POST /tenants/:tid/notifications/templates` — create template
- [ ] `PUT /notification/templates/:id` — update template
- [ ] `DELETE /notification/templates/:id` — delete template
- [ ] `POST /notifications/admin/send` — send notification (admin)

#### Events Published
- [ ] `NotificationQueued` — job created
- [ ] `NotificationSent` — provider accepted
- [ ] `NotificationDelivered` — device confirmed
- [ ] `NotificationRead` — user interaction
- [ ] `NotificationFailed` — retry or dead-letter
- [ ] `DeviceTokenRegistered` — push target available
- [ ] `PreferenceUpdated` — routing changes

---

## Phase 3 — Enhancement & Polish

### 3.1 Discovery Enhancement (`[Prompt: existing module]`)

- [ ] Add geo-location support (PostGIS or `point` type with index)
- [ ] `GET /discovery/nearby?lat=&lng=&radius=` — proper distance query
- [ ] Search indexing (full-text search via PostgreSQL tsvector)
- [ ] Trending tenants (based on order/booking volume)
- [ ] Category-based filtering + pagination
- [ ] Recommendations (future: collaborative filtering)

### 3.2 QR Code Generation (`[Prompt: existing module]`)

- [ ] Install `qrcode` npm package
- [ ] `POST /qr/generate/:tenantId` — returns actual QR image (PNG/SVG)
- [ ] Configurable: size, color, include logo
- [ ] Cache generated QR codes in Redis (invalidated on publish)

### 3.3 Admin Platform (Full RBAC) (`[Prompt: existing module]`)

- [ ] Implement real admin role verification (platform role: `super_admin`, `support`, `operations`)
- [ ] `AdminService` — stats, alerts, moderation queue
- [ ] `GET /admin/audit` — audit log viewer
- [ ] `POST /admin/feature-flags` — global feature toggles (future)

### 3.4 Theme Module Implementation (`[Prompt: empty directory]`)

- [ ] Currently `src/modules/theme/` is empty — implement it
- [ ] Theme tokens: colors, typography, spacing, radius, shadows, icons
- [ ] Light/dark mode support
- [ ] Component-style overrides (per-component theme)
- [ ] Theme compiler: export optimized token bundle for mobile runtime
- [ ] `ThemeService` — CRUD, compile, preview, version

### 3.5 Analytics Platform (`[Prompt: 1, 4]`)

- [ ] `src/modules/analytics/` — event ingestion, aggregation, reporting
- [ ] Track: page views, orders, bookings, form submissions, sign-ups, search queries
- [ ] Report types: daily active tenants, revenue by tenant, popular services
- [ ] API: `GET /analytics/tenants/:id/summary?period=7d`
- [ ] Future: PostHog or custom event pipeline

### 3.6 Full-Text Search (`[Prompt: 1, 3]`)

- [ ] PostgreSQL tsvector indexes on: tenant name, product name, service name, page content
- [ ] Search across all resource types
- [ ] `GET /search?q=&tenantId=&type=product|service|page`

### 3.7 Integrations Platform (`[Prompt: 1, 11]`)

- [ ] `src/modules/integrations/` — webhook sender/receiver framework
- [ ] Connect third-party services per tenant
- [ ] Webhook outbox pattern for reliable delivery
- [ ] Supported: webhook URLs, OpenAI, Google Maps (future)

---

## Storage Architecture Summary (`[Prompt 1]`)

| Resource | Technology | Purpose | Module Access |
|----------|-----------|---------|---------------|
| PostgreSQL | Prisma ORM | All relational data | All modules via PrismaService |
| Redis | ioredis | OTP, sessions, cache, pub/sub, rate limit counters | Auth, Gateway, Queue |
| Queue | Bull (Redis-backed) | Async job processing | Publishing, Notifications, Assets, Payments |
| Object Storage | Local / S3 / R2 | Binary file storage (images, videos, documents) | Asset Platform |
| Search | PostgreSQL FTS | Full-text search across entities | Discovery, Search |
| CDN | Cloudflare / CloudFront | Asset delivery, manifest caching | Asset Platform, Publishing |

---

## Testing Strategy (`[Prompt 1]`)

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Jest | Services, validators, adapters, helpers |
| Integration | Jest + Supertest | Controllers + services with test DB |
| Module | Jest | Cross-service communication, event flows |
| API (E2E) | Supertest | Full request lifecycle through gateway |
| Contract | Pact (future) | Module-to-module API contracts |
| Performance | k6 / autocannon | Rate limiting, latency, throughput |

---

## CI/CD Pipeline (`[Prompt 1]`)

```yaml
# .github/workflows/ci.yml
on: push
jobs:
  lint:     eslint
  test:     jest --coverage
  build:    nest build
  docker:   docker build -t dukadesk/api
  migrate:  prisma migrate deploy (staging/production only)
  deploy:   (environment-specific)
```

---

## Future Evolution to Microservices (`[Prompt 1]`)

The modular monolith is designed for extraction:
1. Each module is self-contained (controller, service, DTO, events)
2. Extract module → wrap in its own NestJS app → expose via gRPC/REST
3. Event bus → message broker (RabbitMQ / Kafka)
4. Shared database → per-service database with event-driven sync
5. Gateway → service mesh (Istio / Linkerd)
