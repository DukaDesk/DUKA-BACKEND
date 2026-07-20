# Backend Agent Context

## Overview

The `backend/` repository contains the core server-side platform for DUKADESK OS. It exposes REST APIs, manages business logic, handles events, and coordinates data persistence.

**Implementation Repository:** [DUKA-BACKEND](https://github.com/DukaDesk/DUKA-BACKEND)
**KB Version:** 0.1.0

## Responsibilities

- Core business logic and domain services
- REST API endpoints (381+ endpoints across 34 modules)
- Authentication and authorization (JWT, OAuth 2.0)
- Event publishing and consumption (Bull/Redis queues)
- Database access and migrations (Prisma + PostgreSQL)
- File uploads, processing, and CDN delivery (Sharp)
- Integration with external services (Stripe, SendGrid, Google Calendar, etc.)
- AI platform provider orchestration (Anthropic, OpenAI, etc.)

## Non-Responsibilities

- Frontend rendering
- Mobile-specific logic
- CLI user interface
- Infrastructure provisioning

## Technology Stack

- **Language:** TypeScript 6.x (Node.js)
- **Framework:** NestJS v11.x
- **Database:** PostgreSQL 16 (via Prisma ORM 6.x)
- **Messaging:** Bull (Redis-backed job queues)
- **Cache:** Redis (via ioredis)
- **Auth:** Passport.js (JWT, Google OAuth 2.0, Apple Sign-In)
- **Validation:** class-validator + class-transformer
- **Logging:** Pino (nestjs-pino)
- **Image Processing:** Sharp
- **API Docs:** Swagger/OpenAPI (@nestjs/swagger)
- **Testing:** Jest + Supertest
- **Linting:** ESLint 10.x + Prettier
- **Containerization:** Docker + Docker Compose

## Repository Structure

```
d
  src/                        # Source code
    main.ts                   # Application entry point
    app.module.ts             # Root module
    common/                   # Shared utilities, guards, interceptors, filters
    modules/                  # Domain modules (auth, tenants, commerce, etc.)
    bff/                      # Backend-for-frontend modules (website, mobile, etc.)
  prisma/
    schema.prisma             # Database schema (~2070 lines)
    seed.ts                   # Seed data
  test/                       # E2E test suites
  docs/                       # Repository documentation
  scripts/                    # Automation scripts
  Dockerfile
  docker-compose.yml
  AGENT_CONTEXT.md
  README.md
```

## Build and Test

| Command | Description |
|---------|-------------|
| `npm run build` | Build the application |
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start production build |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run lint` | Lint source code |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:seed` | Seed the database |

## Engineering Standards

- [Repository Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/REPOSITORY_STANDARD.md)
- [Branching Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/BRANCHING_STANDARD.md)
- [Versioning Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/VERSIONING_STANDARD.md)
- [Pull Request Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/PR_STANDARD.md)
- [Review Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/REVIEW_STANDARD.md)
- [Release Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/RELEASE_STANDARD.md)
- [AI Context Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/AI_CONTEXT_STANDARD.md)
- [Boot Process Standard](/DukaDesk/KNOWLEDGE-BASE/blob/main/engineering-governance/repository-governance/BOOT_PROCESS_STANDARD.md)

## Specification Traceability

Specifications that target this repository:

| Specification | Title | State |
|--------------|-------|-------|
| KB v0.1.0 | Knowledge Base v0.1.0 | Active |

## Agent Conventions

- Reference engineering specifications by ID in commits and pull requests.
- Prefer domain-driven design patterns for new services.
- Validate all inputs and protect secrets.
- Add tests for new behavior and bug fixes.
- Update this context when responsibilities or structure change.
- Use Swagger decorators for all new endpoints.

## Common Tasks

- **Add an API endpoint:** create DTO → service method → controller method → add tests → document with Swagger.
- **Add a database migration:** update schema.prisma → run `prisma:migrate` → test rollback.
- **Consume or publish an event:** add queue producer/consumer using Bull.
- **Integrate a new provider:** implement adapter interface, register in provider registry.

## Escalation

Stop and ask for human input when:

- A change conflicts with an approved ADR.
- A security-critical decision is required.
- A breaking change affects multiple repositories.
- A new external dependency is required.
