# DESK CATEGORY FLAG — Backend TODO

> Status (2026-10-03): IMPLEMENTED in this repo — see §8.
> Frontend (DUKA-MERCHANT) presets the merchant dashboard from the desk
> category chosen **at signup** and remembers it via `merchant.category`.
> The backend does not yet have a first-class category flag — category is
> currently only stored in `TenantConfig.config.app.category`. This doc lists
> the backend work needed so `user details` (auth / merchants endpoints)
> carry the category flag and the frontend no longer needs config fallbacks.

## 1. Goal

- `POST /api/v1/auth/register` accepts `category` (aka `businessCategory`).
- `POST /api/v1/auth/google` accepts optional `category`.
- `GET /api/v1/auth/me` (or equivalent user-details endpoint), `GET /api/v1/app/merchants`,
  and `GET /api/v1/merchants/:id` return `category` on the user/tenant payload.
- Frontend `buildMerchant()` already reads (in order):
  `tenant.category → tenant.businessCategory → tenant.deskCategory → tenant.category → user.category → user.businessCategory`.
  Any one of these fields unblocks the frontend.

## 2. Schema

- [ ] Add `category String?` (or `businessCategory String?`) to `Tenant` in `prisma/schema.prisma`
  (default `null`; backfill from `TenantConfig.config.app.category` where present).
- [ ] Generate + run migration (`npx prisma migrate dev --name add-tenant-category`).
- [ ] Optional: add `category String?` to `User` for Google-signup preset before tenant provisioning.
- [ ] Backfill script: for each `TenantConfig` with `config.app.category`, set `Tenant.category`.

Suggested Prisma:

```prisma
model Tenant {
  // ...existing
  category String? // desk category: Ecommerce | Restaurant | Church | School | Booking | Events | Consulting | Nonprofit | Personal | ...
}
```

## 3. Auth — register / login / Google

File: `src/modules/auth/dto/register.dto.ts`
- [ ] Add optional `category` + `businessCategory` fields:
```ts
@ApiPropertyOptional({ example: 'Church', description: 'Desk category — presets dashboard tools' })
@IsOptional() @IsString() category?: string;

@ApiPropertyOptional({ example: 'Church' })
@IsOptional() @IsString() businessCategory?: string;
```

File: `src/modules/auth/auth.service.ts`
- [ ] `registerMerchant(dto, hash)`: read `dto.category ?? dto.businessCategory`,
  validate against known desk categories (reuse `BUSINESS_CATEGORIES` keys or a shared const),
  pass `{ category }` into `merchantsService.create()`.
- [ ] `generateTokens()` / login response: include `category` from the owned/active tenant
  so `hydrateMerchantCategory()` picks it up on first login without a second fetch.
- [ ] `googleLogin(dto)`: accept optional `category`, same handling as register
  (create tenant with category when provisioning, else update existing tenant if empty).

## 4. Merchants

File: `src/modules/merchants/merchants.service.ts`
- [ ] `create(userId, dto)`: accept + persist `category` on `Tenant`.
- [ ] `update(tenantId, userId, dto)`: accept `category` updates (used by onboarding + `saveCategory()`).
- [ ] `findMy / findOne / list`: always select + return `category` (and keep `name/slug` as today).

File: `src/modules/merchants/merchants.controller.ts` + `merchants-app.controller.ts`
- [ ] Whitelist `category` in update DTOs so `PATCH /merchants/:id` persists it.

## 5. TenantConfig compat (do not break current frontend)

- Frontend currently writes `TenantConfig.config.app = { category, modules, ... }`
  via `saveCategory(category, modules)` + `saveDashboardModules(modules)`.
- [ ] Keep reading `config.app.category` as fallback for 1 release, but treat
  `Tenant.category` as source of truth; when both exist and differ, prefer `Tenant.category`
  and back-sync `config.app.category`.
- [ ] `GET /api/v1/app/merchants` membership rows: include `tenant: { id, name, slug, category }`.

## 6. Validation / tests

- [ ] Unit: `auth-merchants.spec.ts` — register with `{ businessName, category: 'Church' }`
  creates tenant with `category === 'Church'`.
- [ ] Unit: login returns `user.category` / `tenant.category`.
- [ ] E2E: `POST /auth/register { category: 'School' }` → `GET /app/merchants` shows `category: 'School'`.
- [ ] Migration test: existing tenants with `config.app.category` get backfilled.

## 7. Frontend contract (already implemented, for reference)

- Signup sends `{ category, businessCategory }` best-effort; ignores unknown-field errors.
- `VerticalProvider.setCategory(value)` resets dashboard tools to
  `verticalPresetModules(getVertical(value))`:
  - Church / Nonprofit → Donations (giving) + Attendance, **no Orders**
  - School → Fees + Attendance + Classes, **no Orders**
  - Booking → Appointments + Memberships + Classes, **no Orders**
  - Events → Tickets, **no Orders**
  - Shops / Restaurant / Grocery / Consulting / Personal → Orders (Orders / Invoices / Inquiries)
- "Integrations" renamed to "More Tools" (route id `integrations` kept; alias `more-tools` added).
- All hardcoded "Business" UI copy now uses `useVertical().categoryName` (`Church`, `School`, …).

## 8. Rollout

1. Land schema + backfill behind no flag (additive, nullable).
2. Land auth/merchants changes; verify staging `/auth/register` with category.
3. Frontend already tolerant: works with or without backend flag (localStorage + config fallback).
4. After prod backfill, remove `config.app.category` fallback (frontend cleanup).

## 9. Implemented (2026-10-03)

- `prisma/schema.prisma`: `Tenant.category String?` + migration
  `prisma/migrations/20261003000000_add_tenant_category/migration.sql`.
- `RegisterDto`: optional `category` + `businessCategory`.
- `GoogleLoginDto` / `AppleLoginDto`: optional `category` (+ `businessCategory` on Google).
- `CreateTenantDto` / `UpdateTenantDto`: optional `category`.
- `MerchantsService.create/update`: persists `category` to `Tenant.category`
  (with pre-migration fallback) AND mirrors it to `TenantConfig.config.app.category`;
  `findById` / `findBySlug` / `getMyTenants` always return `category`
  (column first, `TenantConfig` fallback).
- `AuthService.registerMerchant`: forwards signup `category` into tenant provisioning.
- `AuthService.generateTokens` (login / register / refresh / social): `merchants[]`
  now include `category` (column first, `TenantConfig` fallback, else `null`).
- `AuthService.googleLogin`: persists a preset `category` onto the user's tenant(s).
- Tests: `auth-merchants.spec.ts` updated + new case
  ("forwards the desk category to merchant provisioning").
- Deploy note: run `prisma migrate deploy` (or `prisma migrate dev` locally) so the
  `tenants.category` column exists; code tolerates its absence via the
  `TenantConfig` fallback until then.
