# DUKA-BACKEND

Multi-tenant backend platform powering the DUKADESK ecosystem. Businesses register once, create branded app configurations, and instantly publish updates to customers through a single React Native runtime — no separate app stores needed.

## Architecture

```
                    ┌──────────────────────┐
                    │   DUKADESK API        │
                    │   NestJS + Prisma     │
                    └──────┬───────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                   │
   Identity           Builder            Renderer
   Module             Module              Module
        │                  │                   │
   Tenant             Commerce            Discovery
   Module              Module              Module
        │                  │                   │
   Media               QR                 Admin
   Module              Module              Module
        │
   ┌────┴────┐
   │  PostgreSQL │  Redis
   └─────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS (Node.js + TypeScript) |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT + Refresh Tokens |
| Validation | class-validator + class-transformer |
| API Docs | Swagger (OpenAPI) |
| File Storage | Local (S3/R2 ready) |

## Project Structure

```
src/
├── main.ts                          # App entry point
├── app.module.ts                    # Root module
├── common/                          # Shared layer
│   ├── decorators/                  # @Public(), @CurrentUser()
│   ├── guards/                      # JwtAuthGuard
│   ├── interceptors/                # TransformInterceptor (wraps responses)
│   ├── filters/                     # HttpExceptionFilter
│   ├── strategies/                  # JwtStrategy (Passport)
│   ├── prisma.service.ts           # Prisma client
│   └── prisma.module.ts            # Global Prisma module
├── modules/                         # Feature modules
│   ├── auth/                        # Register, login, OTP, refresh
│   ├── users/                       # Profile, consents, memberships
│   ├── tenants/                     # CRUD, publish, ownership
│   ├── builder/                     # Pages, sections, components, nav, theme
│   ├── renderer/                    # App definition JSON output
│   ├── commerce/                    # Categories, products
│   ├── templates/                   # Template listing + application
│   ├── media/                       # File upload/delete
│   ├── qr/                          # Generate & resolve QR
│   ├── discovery/                   # Featured, search, categories
│   ├── admin/                       # Approval, suspension, stats
│   └── notifications/               # Push notification stubs
└── shared/                          # Shared types & interfaces
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

# Seed templates
npx prisma db seed

# Start development server
npm run start:dev
```

API will be available at `http://localhost:4000/api/v1`

Swagger docs at `http://localhost:4000/api/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile to dist/ |
| `npm run start:prod` | Run compiled build |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run dev migrations |
| `npm run prisma:seed` | Seed template data |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run docker:up` | Start PostgreSQL + Redis |

## API Overview

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Create account |
| POST | `/login` | No | Login |
| POST | `/refresh` | No | Refresh token |
| POST | `/logout` | Yes | Revoke tokens |
| POST | `/send-otp` | No | Send OTP |
| POST | `/verify-otp` | No | Verify OTP |

### Profile (`/api/v1/profile`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get profile |
| PUT | `/` | Update profile |
| GET | `/memberships` | List tenant memberships |
| GET | `/consents` | List consents |
| POST | `/consents` | Grant consent |
| DELETE | `/consents/:tenantId` | Revoke consent |

### Tenants (`/api/v1/tenants`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create tenant |
| GET | `/my` | My tenants |
| GET | `/:id` | Get tenant |
| PUT | `/:id` | Update tenant |
| POST | `/:id/publish` | Publish tenant |

### Renderer (`/api/v1`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/:id/definition` | App JSON definition |
| GET | `/resolve/:slug` | Resolve tenant by slug |

### Commerce (`/api/v1`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenants/:tid/categories` | Create category |
| GET | `/tenants/:tid/categories` | List categories |
| POST | `/tenants/:tid/products` | Create product |
| GET | `/tenants/:tid/products` | List products (paginated) |
| GET | `/products/:id` | Get product |
| PUT | `/products/:id` | Update product |
| DELETE | `/products/:id` | Delete product |

### Response Format
```json
{
  "success": true,
  "message": "OK",
  "data": { }
}

{
  "success": false,
  "errors": ["Error message"]
}
```

## Database Schema

### Core Tables
- **users** — Platform user accounts
- **profiles** — Extended user info
- **tenants** — Business entities
- **tenant_users** — Tenant membership & roles
- **consents** — User data sharing permissions
- **consent_scopes** — Permission scopes per consent

### Builder Tables
- **templates** — Pre-built app templates
- **pages** — Tenant app pages
- **sections** — Page sections
- **components** — UI components within sections
- **navigations** — Bottom tab navigation config
- **themes** — Color/branding config

### Commerce Tables
- **categories** — Product categories
- **products** — Tenant products
- **product_images** — Product image gallery

### Other
- **media** — Uploaded files
- **notifications** — Push notifications
- **audit_logs** — Activity audit trail

## Server-Driven UI

The renderer generates a JSON application definition consumed by the React Native app:

```json
{
  "tenantId": "uuid",
  "name": "ABC Pharmacy",
  "theme": {
    "primaryColor": "#0066FF",
    "fontFamily": "Inter"
  },
  "navigation": [
    { "label": "Home", "action": "navigate", "target": "/home" }
  ],
  "screens": [
    {
      "name": "Home",
      "slug": "home",
      "blocks": [
        {
          "type": "hero",
          "components": [
            {
              "type": "HeroBanner",
              "props": {
                "title": "Welcome",
                "cta": { "label": "Shop Now" }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## MVP Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Platform Foundation (Auth, Tenants, Media, QR, Admin) | ✅ Complete |
| 2 | Builder (Templates, Pages, Navigation, Theme, Publish) | ✅ Complete |
| 3 | Renderer (App definition API, versioning, cache) | ✅ Complete |
| 4 | Commerce (Products, Categories, Inventory, Discovery) | ✅ Complete |
| 5 | Operations (Notifications, Analytics, Audit) | ✅ Stubbed |
| 6 | Orders & Payments | 📋 Planned |
| 7 | Bookings & Appointments | 📋 Planned |
