# DUKA-BACKEND Implementation

## Architecture Decisions

### Modular Monolith
All modules live in a single NestJS application but are fully decoupled. Each module has its own controller, service, and DTOs. Future extraction into microservices requires only wrapping modules in their own NestJS apps.

### Prisma ORM (v6)
Chosen over TypeORM for its type-safe queries, excellent migration support, and simpler schema definition. v6 used instead of v7 for stability.

### Passport + JWT
Standard NestJS authentication pattern. JWT access tokens (15min) + UUID refresh tokens (7 days). Refresh token rotation invalidates previous tokens.

### Class-validator DTOs
Validation at the controller boundary using decorators. Whitelist mode strips unknown properties, forbidNonWhitelisted rejects them.

### Response Envelope
Every response wrapped in `{ success, message, data }` or `{ success, errors: [] }` via global interceptor and exception filter.

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
| `/api/v1/auth/send-otp` | POST | Public | Generates 6-digit OTP (stored in memory) |
| `/api/v1/auth/verify-otp` | POST | Public | Validates OTP, marks email verified |

**Key Decisions**:
- Passwords hashed with bcrypt (12 rounds)
- OTP stored in-memory Map (in-memory, lost on restart — use Redis for production)
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

### 3. Tenants Module
**Files**: `src/modules/tenants/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants` | POST | JWT | Create tenant + auto-join creator as owner |
| `/api/v1/tenants/my` | GET | JWT | List user's tenants |
| `/api/v1/tenants/:id` | GET | Public | Get tenant with theme, nav, counts |
| `/api/v1/tenants/:id` | PUT | JWT | Update tenant (owner only) |
| `/api/v1/tenants/:id/publish` | POST | JWT | Publish tenant, create default theme |

**Key Decisions**:
- Ownership verified via `verifyOwnership` private method
- Slug uniqueness enforced at DB level
- Publishing auto-creates a default theme if none exists
- Status flow: `draft → published` (admin can set `suspended`)

---

### 4. Builder Module
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
- Builder endpoints are separate from renderer
- Data model: Page → Section → Component (hierarchical)
- Navigation and Theme are singleton per tenant (unique constraint on tenantId)

---

### 5. Renderer Module
**Files**: `src/modules/renderer/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants/:id/definition` | GET | Public | Full app definition JSON |
| `/api/v1/resolve/:slug` | GET | Public | Resolve tenant by slug (for QR) |

**Output**: Generates `{ tenantId, name, status, theme, navigation, screens }` JSON.

**Key Decisions**:
- Renderer queries active pages/sections/components only
- Theme defaults provided if tenant has no theme
- This is the core server-driven UI contract — mobile app consumes this JSON

---

### 6. Commerce Module
**Files**: `src/modules/commerce/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants/:tid/categories` | POST | JWT | Create category |
| `/api/v1/tenants/:tid/categories` | GET | Public | List categories |
| `/api/v1/categories/:id` | PUT | JWT | Update category |
| `/api/v1/categories/:id` | DELETE | JWT | Soft-delete category |
| `/api/v1/tenants/:tid/products` | POST | JWT | Create product with images |
| `/api/v1/tenants/:tid/products` | GET | Public | List products (paginated, filterable) |
| `/api/v1/products/:id` | GET | Public | Get single product |
| `/api/v1/products/:id` | PUT | JWT | Update product + replace images |
| `/api/v1/products/:id` | DELETE | JWT | Soft-delete product |

**Query Params** for `GET /products`: `?page=1&limit=20&categoryId=xxx&search=term`

**Key Decisions**:
- Paginated response includes `{ data, meta: { page, limit, total, pages } }`
- Product images handled as separate table, replace on update
- Price uses Decimal for precision
- Soft-delete (sets `isActive: false`) rather than hard delete
- Case-insensitive search on product name (PostgreSQL mode)

---

### 7. Templates Module
**Files**: `src/modules/templates/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/templates` | GET | Public | List active templates (optional `?category=` filter) |
| `/api/v1/templates/:id` | GET | Public | Get template by ID |
| `/api/v1/templates/:id/use` | POST | JWT | Apply template to tenant (`?tenantId=xxx`) |

**Seed Data**: 3 templates (Modern Store, Restaurant, Clinic)

**Key Decisions**:
- Template config stores pages, sections, components, navigation, and theme as JSON
- `useTemplate` creates DB records from the JSON config
- Allows non-destructive re-application (creates new pages)

---

### 8. Media Module
**Files**: `src/modules/media/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/tenants/:tid/media/upload` | POST | JWT | Upload file (multipart) |
| `/api/v1/tenants/:tid/media` | GET | JWT | List tenant media |
| `/api/v1/tenants/:tid/media/:id` | DELETE | JWT | Delete file + DB record |

**Key Decisions**:
- Files stored on local filesystem in `uploads/` directory
- Files served statically via NestJS `useStaticAssets` at `/uploads/`
- S3/R2 integration ready (swap `StorageProvider` in .env)
- Filename randomized with UUID to prevent collisions

---

### 9. QR Module
**Files**: `src/modules/qr/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/qr/generate/:tenantId` | POST | JWT | Generate QR metadata |
| `/api/v1/qr/resolve/:slug` | GET | Public | Resolve slug → tenant deep link |

**Key Decisions**:
- QR data returns `{ tenantId, slug, url: "https://dukadesk.com/t/{slug}" }`
- Deep link format: `dukadesk://tenant/{slug}`
- Actual QR image generation not implemented (requires `qrcode` npm package or external service)

---

### 10. Discovery Module
**Files**: `src/modules/discovery/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/discovery/featured` | GET | Public | Recently published tenants |
| `/api/v1/discovery/search` | GET | Public | Search by name (`?q=term`) |
| `/api/v1/discovery/categories` | GET | Public | Static category list |
| `/api/v1/discovery/nearby` | GET | Public | Nearby tenants (stub, `?lat=&lng=`) |

**Key Decisions**:
- Categories are hardcoded (12 categories matching platform verticals)
- Featured returns last 10 published tenants
- Nearby is a stub (no geolocation queries yet)
- Search uses case-insensitive `contains`

---

### 11. Admin Module
**Files**: `src/modules/admin/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/admin/tenants/:id/approve` | POST | JWT | Approve → published |
| `/api/v1/admin/tenants/:id/suspend` | POST | JWT | Suspend tenant |
| `/api/v1/admin/tenants` | GET | JWT | List all tenants (optional `?status=`) |
| `/api/v1/admin/stats` | GET | JWT | Platform statistics |

**Key Decisions**:
- Admin role check is a stub — only verifies user exists
- Full RBAC required for production (admin roles table + guard)

---

### 12. Notifications Module
**Files**: `src/modules/notifications/`

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/api/v1/notifications` | GET | JWT | List user's recent notifications |
| `/api/v1/notifications/:id/read` | PUT | JWT | Mark as read |

**Key Decisions**:
- Push dispatch not implemented (requires FCM/APNS integration)
- DB model stores notification records for history
- `sendPush()` helper method available for other modules

---

## Database Schema

### Entity Relationships

```
User
 ├── Profile (1:1)
 ├── RefreshToken (1:N)
 ├── TenantUser (1:N) → Tenant
 ├── Consent (1:N) → Tenant
 └── Notification (1:N)

Tenant
 ├── TenantUser (1:N) → User
 ├── Consent (1:N) → User
 ├── Page (1:N)
 │   └── Section (1:N)
 │       └── Component (1:N)
 ├── Navigation (1:1)
 ├── Theme (1:1)
 ├── Category (1:N)
 │   └── Product (1:N)
 │       └── ProductImage (1:N)
 ├── Media (1:N)
 └── AuditLog (1:N)
```

### Key Constraints

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `users` | `email` unique | Single platform identity |
| `tenants` | `slug` unique | URL-friendly identifier |
| `tenant_users` | `(tenantId, userId)` unique | One membership per tenant |
| `consents` | `(tenantId, userId)` unique | One consent per pair |
| `pages` | `(tenantId, slug)` unique | No duplicate page slugs |
| `categories` | `(tenantId, slug)` unique | No duplicate category slugs |
| `products` | `(tenantId, slug)` unique | No duplicate product slugs |

---

## Architecture Patterns

### Guard Chain
1. `ThrottlerGuard` (global) — rate limiting
2. `JwtAuthGuard` (per-route) — JWT validation
3. Custom ownership checks (in service layer)

### Request Lifecycle
```
Request → ThrottlerGuard → JwtAuthGuard → ValidationPipe → Controller → Service → Prisma → DB
```

### Response Pipeline
```
Controller → TransformInterceptor → { success, message, data }
Error → HttpExceptionFilter → { success, errors: [] }
```

---

## Pending Items for Production

### Security
- [ ] Admin role-based access control (RBAC guard)
- [ ] Rate limiting on auth endpoints (login, register)
- [ ] CORS restrict to specific origins
- [ ] Helmet.js for security headers
- [ ] Request validation: max body size, file size limits
- [ ] OTP stored in Redis instead of in-memory Map

### Features
- [ ] Orders & cart module
- [ ] Payments (Paystack, Monnify, Stripe)
- [ ] Appointment booking engine
- [ ] Push notifications (FCM + APNS)
- [ ] Email service (SES/SendGrid)
- [ ] SMS service (Twilio/Termii)
- [ ] Analytics service (PostHog)
- [ ] QR image generation (`qrcode` package)
- [ ] S3/R2 media storage (swap storage provider)

### Infrastructure
- [ ] Docker Compose for full stack (app + postgres + redis)
- [ ] CI/CD pipeline
- [ ] Health check endpoint
- [ ] Structured logging (Serilog/Pino)
- [ ] OpenTelemetry tracing
- [ ] Database indexes for performance
- [ ] Connection pooling (pgBouncer)

### Testing
- [ ] Unit tests for services
- [ ] E2E tests for auth flow
- [ ] E2E tests for tenant CRUD
- [ ] API contract tests

---

## Template Seed Data

3 templates ship with the platform:

1. **Modern Store** — E-commerce with hero banner, category grid, product carousel, product grid
2. **Restaurant** — Menu display with hero, category menu, ordering
3. **Clinic** — Medical services with hero, service grid, booking

Each template defines: pages → sections → components + navigation items + theme colors.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | API server port |
| `DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `JWT_SECRET` | super-secret... | JWT signing key |
| `JWT_EXPIRATION` | 15m | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | 7d | Refresh token TTL |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `CORS_ORIGINS` | * | Allowed origins |
| `THROTTLE_TTL` | 60 | Rate limit window (sec) |
| `THROTTLE_LIMIT` | 100 | Max requests per window |
