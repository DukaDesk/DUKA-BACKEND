# DUKA-BACKEND API Endpoints Reference

**Version:** 0.1.0
**Knowledge Base Version:** KB v0.1.0
**Last Updated:** 2026-07-16
**Repository:** [DUKA-BACKEND](https://github.com/DukaDesk/DUKA-BACKEND)

## Overview

This document catalogs all REST API endpoints exposed by the DUKA-BACKEND service.

- **Global Prefix:** `/api`
- **Versioning:** URI-based, default version `v1`
- **Full Path Pattern:** `/api/v1/{resource}`
- **Swagger Docs:** `/api/docs`
- **Framework:** NestJS (TypeScript/Node.js)

---

## Table of Contents

1. [Auth & IAM](#1-auth--iam)
2. [Profile & Users](#2-profile--users)
3. [Tenants](#3-tenants)
4. [Templates](#4-templates)
5. [Builder (SDUI)](#5-builder-sdui)
6. [Renderer](#6-renderer)
7. [Commerce](#7-commerce)
8. [Media / DAM](#8-media--dam)
9. [QR Codes](#9-qr-codes)
10. [Discovery](#10-discovery)
11. [Admin](#11-admin)
12. [Notifications](#12-notifications)
13. [Publishing](#13-publishing)
14. [Booking & Scheduling](#14-booking--scheduling)
15. [Forms & Workflow](#15-forms--workflow)
16. [Payments](#16-payments)
17. [Theme](#17-theme)
18. [Integrations](#18-integrations)
19. [Analytics & BI](#19-analytics--bi)
20. [Search & Discovery](#20-search--discovery)
21. [AI Platform](#21-ai-platform)
22. [Platform Administration](#22-platform-administration)
23. [Infrastructure & DevOps](#23-infrastructure--devops)
24. [Security & Compliance](#24-security--compliance)
25. [Developer Platform](#25-developer-platform)
26. [Marketplace & Plugins](#26-marketplace--plugins)
27. [Asset Platform Enhanced](#27-asset-platform-enhanced)
28. [BFF - Website](#28-bff---website)
29. [BFF - Tenant Dashboard](#29-bff---tenant-dashboard)
30. [BFF - Mobile](#30-bff---mobile)
31. [BFF - Business Dashboard](#31-bff---business-dashboard)
32. [Health](#32-health)

---

## 1. Auth & IAM

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register a new user |
| POST | `/api/v1/auth/login` | Login with email and password |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout and revoke refresh tokens |
| POST | `/api/v1/auth/send-otp` | Send OTP to email |
| POST | `/api/v1/auth/verify-otp` | Verify OTP code |
| POST | `/api/v1/auth/google` | Sign in / register with Google ID token |
| POST | `/api/v1/auth/apple` | Sign in / register with Apple identity token |

### Recovery

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |

### Device Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/devices/register` | Register a device |
| GET | `/api/v1/devices` | List all devices |
| PUT | `/api/v1/devices/:id` | Update device metadata |
| DELETE | `/api/v1/devices/:id` | Revoke a device |

---

## 2. Profile & Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/profile` | Get current user profile |
| PUT | `/api/v1/profile` | Update user profile |
| GET | `/api/v1/profile/memberships` | Get all tenant memberships |
| GET | `/api/v1/profile/consents` | Get all consents |
| POST | `/api/v1/profile/consents` | Grant consent to a tenant |
| DELETE | `/api/v1/profile/consents/:tenantId` | Revoke consent for a tenant |

---

## 3. Tenants

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants` | Create a new tenant |
| GET | `/api/v1/tenants/my` | Get my tenants |
| GET | `/api/v1/tenants/:id` | Get tenant by ID |
| PUT | `/api/v1/tenants/:id` | Update tenant |
| POST | `/api/v1/tenants/:id/publish` | Publish tenant |
| GET | `/api/v1/tenants/:id/config` | Get tenant runtime configuration |
| PUT | `/api/v1/tenants/:id/config` | Update tenant runtime configuration |
| GET | `/api/v1/tenants/:id/features` | Get enabled capabilities |
| GET | `/api/v1/tenants/:id/subscription` | Get tenant subscription |
| POST | `/api/v1/tenants/:id/subscribe` | Subscribe to a plan |
| POST | `/api/v1/tenants/:id/subscription/cancel` | Cancel subscription |

---

## 4. Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/templates` | List all templates (optional category filter) |
| GET | `/api/v1/templates/:id` | Get template by ID |
| POST | `/api/v1/templates/:id/use` | Apply template to a tenant |

---

## 5. Builder (SDUI)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tenants/:tenantId/pages` | Get all pages for a tenant |
| PUT | `/api/v1/tenants/:tenantId/pages/:pageId` | Update a page |
| POST | `/api/v1/tenants/:tenantId/pages/:pageId/sections` | Add a section to a page |
| PUT | `/api/v1/tenants/:tenantId/sections/:sectionId` | Update a section |
| POST | `/api/v1/tenants/:tenantId/sections/:sectionId/components` | Add a component to a section |
| PUT | `/api/v1/tenants/:tenantId/components/:componentId` | Update a component |
| GET | `/api/v1/tenants/:tenantId/navigation` | Get navigation for a tenant |
| PUT | `/api/v1/tenants/:tenantId/navigation` | Update navigation |
| GET | `/api/v1/tenants/:tenantId/component-types` | Get all registered component definitions |
| GET | `/api/v1/tenants/:tenantId/component-types/:type` | Get a specific component type definition |
| GET | `/api/v1/tenants/:tenantId/action-types` | Get all registered action definitions |
| POST | `/api/v1/tenants/:tenantId/actions/execute` | Execute an action with given context |
| POST | `/api/v1/tenants/:tenantId/conditions/evaluate` | Evaluate conditional visibility |
| POST | `/api/v1/tenants/:tenantId/data-binding/resolve` | Resolve a data binding against context |
| POST | `/api/v1/tenants/:tenantId/preview` | Preview full tenant rendering |
| POST | `/api/v1/tenants/:tenantId/pages/:pageId/preview` | Preview a single page |
| POST | `/api/v1/tenants/:tenantId/component-preview` | Validate and preview a component |
| GET | `/api/v1/tenants/:tenantId/theme` | Get theme for a tenant |
| PUT | `/api/v1/tenants/:tenantId/theme` | Update theme for a tenant |

---

## 6. Renderer

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tenants/:id/definition` | Get application definition for a tenant |
| GET | `/api/v1/resolve/:slug` | Resolve tenant by slug |

---

## 7. Commerce

### Categories

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/categories` | Create category |
| GET | `/api/v1/tenants/:tenantId/categories` | List categories |
| PUT | `/api/v1/categories/:id` | Update category |
| DELETE | `/api/v1/categories/:id` | Delete category |

### Products & Variants

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/products` | Create product with variants |
| GET | `/api/v1/tenants/:tenantId/products` | List products with filter, sort, pagination |
| GET | `/api/v1/products/:id` | Get product with variants |
| PUT | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Delete product |
| GET | `/api/v1/product-types` | List valid product types |
| GET | `/api/v1/tenants/:tenantId/products/type/:type` | List products by type |
| PUT | `/api/v1/products/:id/extended-pricing` | Set multi-currency pricing |
| GET | `/api/v1/products/:id/price` | Get product price in specific currency |
| POST | `/api/v1/products/:id/variants` | Add variant to product |
| PUT | `/api/v1/variants/:id` | Update variant |
| DELETE | `/api/v1/variants/:id` | Delete variant |

### Inventory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products/:id/stock` | Get available stock for product/variant |
| POST | `/api/v1/products/:id/reserve` | Reserve inventory |
| POST | `/api/v1/reservations/:id/release` | Release inventory reservation |
| POST | `/api/v1/reservations/:id/confirm` | Confirm reservation and deduct inventory |
| POST | `/api/v1/products/:id/adjust-stock` | Adjust stock level |

### Cart

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/cart` | Get or create cart |
| GET | `/api/v1/cart/:id` | Get cart with items |
| POST | `/api/v1/cart/:id/items` | Add item to cart |
| PATCH | `/api/v1/cart/items/:itemId` | Update cart item quantity |
| DELETE | `/api/v1/cart/items/:itemId` | Remove item from cart |
| POST | `/api/v1/cart/:id/coupon` | Apply coupon to cart |
| DELETE | `/api/v1/cart/:id/coupon` | Remove coupon from cart |
| POST | `/api/v1/cart/:id/checkout` | Convert cart to order |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tenants/:tenantId/orders` | List orders |
| GET | `/api/v1/orders/:id` | Get order detail |
| POST | `/api/v1/orders/:id/status` | Update order status with transition validation |

### Coupons

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/coupons` | Create coupon |
| GET | `/api/v1/tenants/:tenantId/coupons` | List coupons |
| PUT | `/api/v1/coupons/:id` | Update coupon |
| DELETE | `/api/v1/coupons/:id` | Delete coupon |

### Fulfillments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/orders/:orderId/fulfillments` | Create fulfillment |
| GET | `/api/v1/orders/:orderId/fulfillments` | List fulfillments for order |
| PATCH | `/api/v1/fulfillments/:id` | Update fulfillment status |

### Tax Rules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/tax-rules` | Create tax rule |
| GET | `/api/v1/tenants/:tenantId/tax-rules` | List tax rules |
| PUT | `/api/v1/tax-rules/:id` | Update tax rule |
| DELETE | `/api/v1/tax-rules/:id` | Delete tax rule |
| GET | `/api/v1/tenants/:tenantId/tax-calc` | Calculate tax for subtotal |

---

## 8. Media / DAM

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/media/upload` | Upload file with optimization & variant generation |
| GET | `/api/v1/tenants/:tenantId/media` | List media files (optionally filtered by folder) |
| GET | `/api/v1/tenants/:tenantId/media/:id` | Get media details with versions |
| PATCH | `/api/v1/tenants/:tenantId/media/:id` | Update media metadata |
| DELETE | `/api/v1/tenants/:tenantId/media/:id` | Delete media file and all variants |
| GET | `/api/v1/tenants/:tenantId/media/:id/cdn-url` | Get CDN delivery URL |
| POST | `/api/v1/tenants/:tenantId/media/folders` | Create asset folder |
| GET | `/api/v1/tenants/:tenantId/media/folders` | List asset folders |
| PATCH | `/api/v1/tenants/:tenantId/media/folders/:id` | Update folder |
| DELETE | `/api/v1/tenants/:tenantId/media/folders/:id` | Delete empty folder |

---

## 9. QR Codes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/qr/generate/:tenantId` | Generate QR code data for a tenant |
| GET | `/api/v1/qr/resolve/:slug` | Resolve QR code slug to tenant |

---

## 10. Discovery

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/discovery/featured` | Get featured / popular tenants |
| GET | `/api/v1/discovery/search` | Search tenants |
| GET | `/api/v1/discovery/categories` | Get discover categories |
| GET | `/api/v1/discovery/nearby` | Get nearby tenants |

---

## 11. Admin

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/tenants/:id/approve` | Approve a tenant |
| POST | `/api/v1/admin/tenants/:id/suspend` | Suspend a tenant |
| GET | `/api/v1/admin/tenants` | Get all tenants (admin) |
| GET | `/api/v1/admin/stats` | Get platform stats |

---

## 12. Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notifications` | List user notifications |
| GET | `/api/v1/notifications/unread-count` | Get unread notification count |
| PUT | `/api/v1/notifications/:id/read` | Mark notification as read |
| POST | `/api/v1/notifications/mark-all-read` | Mark all notifications as read |
| POST | `/api/v1/notifications/templates` | Create notification template |
| GET | `/api/v1/notifications/templates` | List templates |
| PUT | `/api/v1/notifications/templates/:id` | Update template |
| DELETE | `/api/v1/notifications/templates/:id` | Delete template |
| POST | `/api/v1/notifications/send-from-template` | Send notification from template |
| GET | `/api/v1/notifications/preferences` | Get notification preferences |
| POST | `/api/v1/notifications/preferences` | Set notification preference |
| POST | `/api/v1/notifications/devices` | Register device for push notifications |
| DELETE | `/api/v1/notifications/devices/:token` | Unregister device |
| POST | `/api/v1/notifications/sms` | Send SMS notification |
| POST | `/api/v1/notifications/campaigns` | Send push/email campaign |
| POST | `/api/v1/notifications/campaigns/sms` | Send SMS campaign |
| POST | `/api/v1/notifications/:id/click` | Track notification click |
| GET | `/api/v1/notifications/analytics` | Notification click analytics |
| POST | `/api/v1/notifications/send` | Send notification directly |

---

## 13. Publishing

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:id/publishing/validate` | Validate current draft |
| POST | `/api/v1/tenants/:id/publishing/publish` | Validate, compile, and publish |
| GET | `/api/v1/tenants/:id/publishing/releases` | Get release history |
| GET | `/api/v1/tenants/:id/publishing/releases/:version` | Get specific release |
| POST | `/api/v1/tenants/:id/publishing/rollback/:version` | Rollback to a previous version |
| GET | `/api/v1/tenants/:id/publishing/draft` | Get current draft state |

---

## 14. Booking & Scheduling

### Services

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/services` | Create booking service |
| GET | `/api/v1/tenants/:tenantId/booking/services` | List booking services |
| GET | `/api/v1/booking/services/:id` | Get booking service with assigned staff |
| PUT | `/api/v1/booking/services/:id` | Update booking service |
| DELETE | `/api/v1/booking/services/:id` | Delete booking service |

### Locations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/locations` | Create booking location |
| GET | `/api/v1/tenants/:tenantId/booking/locations` | List booking locations |
| PUT | `/api/v1/booking/locations/:id` | Update booking location |
| DELETE | `/api/v1/booking/locations/:id` | Delete booking location |

### Cancellation Policies

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/cancellation-policies` | Create cancellation policy with refund tiers |
| GET | `/api/v1/tenants/:tenantId/booking/cancellation-policies` | List cancellation policies |
| GET | `/api/v1/booking/:id/cancellation-refund` | Calculate refund amount |

### Reminders

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/booking/:id/reminders` | Schedule reminders for a booking |
| POST | `/api/v1/booking/reminders/process` | Process pending reminders |

### Staff

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/staff` | Create staff member with service assignments |
| GET | `/api/v1/tenants/:tenantId/booking/staff` | List staff members |
| GET | `/api/v1/booking/staff/:id` | Get staff member |
| PUT | `/api/v1/booking/staff/:id` | Update staff member |
| DELETE | `/api/v1/booking/staff/:id` | Delete staff member |

### Resources

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/resources` | Create booking resource |
| GET | `/api/v1/tenants/:tenantId/booking/resources` | List resources |
| PUT | `/api/v1/booking/resources/:id` | Update resource |
| DELETE | `/api/v1/booking/resources/:id` | Delete resource |

### Schedules & Availability

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/schedules` | Create schedule |
| GET | `/api/v1/tenants/:tenantId/booking/schedules` | List schedules |
| PUT | `/api/v1/booking/schedules/:id` | Update schedule |
| DELETE | `/api/v1/booking/schedules/:id` | Delete schedule |
| GET | `/api/v1/tenants/:tenantId/booking/availability` | Get available time slots |

### Bookings

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking` | Create booking (public) |
| GET | `/api/v1/tenants/:tenantId/booking` | List bookings |
| GET | `/api/v1/booking/:id` | Get booking detail with history |
| POST | `/api/v1/booking/:id/status` | Update booking status |
| GET | `/api/v1/tenants/:tenantId/booking/calendar` | Get booking timeline for a date range |

### Waiting List

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/booking/waiting-list` | Add to waiting list |
| GET | `/api/v1/tenants/:tenantId/booking/waiting-list` | Get waiting list |
| POST | `/api/v1/booking/waiting-list/:id/notify` | Mark waiting list entry as notified |

---

## 15. Forms & Workflow

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/forms` | Create form with fields |
| GET | `/api/v1/tenants/:tenantId/forms` | List forms |
| GET | `/api/v1/forms/:id` | Get form with fields and workflow |
| PUT | `/api/v1/forms/:id` | Update form (auto-increments version) |
| DELETE | `/api/v1/forms/:id` | Delete form |
| POST | `/api/v1/forms/:id/submit` | Submit form answers (public) |
| GET | `/api/v1/forms/:id/submissions` | List submissions for a form |
| GET | `/api/v1/submissions/:id` | Get submission detail |
| POST | `/api/v1/forms/:id/workflow` | Set approval workflow steps |
| POST | `/api/v1/submissions/:id/approve` | Approve or reject a submission |

---

## 16. Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/payments/initialize` | Initialize a payment with provider |
| POST | `/api/v1/payments/:intentId/verify` | Verify payment intent with provider |
| GET | `/api/v1/tenants/:tenantId/payments` | List payment intents |
| POST | `/api/v1/payments/:intentId/refund` | Process a refund (partial or full) |
| POST | `/api/v1/tenants/:tenantId/payments/settlements` | Record a settlement entry |
| POST | `/api/v1/payments/settlements/:id/confirm` | Confirm a settlement as received |
| GET | `/api/v1/tenants/:tenantId/payments/settlements` | List settlements |
| GET | `/api/v1/tenants/:tenantId/payments/transactions` | List payment transactions |
| GET | `/api/v1/payments/health/:provider` | Check health of a payment provider |
| GET | `/api/v1/payments/health` | Check health of all payment providers |
| GET | `/api/v1/tenants/:tenantId/payments/accounts` | Get payment accounts for tenant |
| POST | `/api/v1/payments/webhook/:provider` | Provider webhook endpoint (public) |

---

## 17. Theme

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tenants/:tenantId/theme` | Get current theme configuration |
| PUT | `/api/v1/tenants/:tenantId/theme` | Update theme configuration with versioning |
| GET | `/api/v1/tenants/:tenantId/theme/versions` | Get theme version history |
| GET | `/api/v1/tenants/:tenantId/theme/versions/:version` | Get a specific theme version snapshot |
| POST | `/api/v1/tenants/:tenantId/theme/versions/:version/restore` | Restore a previous theme version |
| GET | `/api/v1/tenants/:tenantId/theme/compiled` | Get compiled theme token bundle (light + dark) |
| GET | `/api/v1/tenants/:tenantId/theme/preview` | Get theme tokens for live preview |
| POST | `/api/v1/tenants/:tenantId/theme/reset` | Reset theme to factory defaults |

---

## 18. Integrations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/integrations/available` | List available integration connectors |
| POST | `/api/v1/tenants/:tenantId/integrations/connect` | Connect an integration provider |
| POST | `/api/v1/tenants/:tenantId/integrations/:provider/disconnect` | Disconnect an integration |
| GET | `/api/v1/tenants/:tenantId/integrations` | List connected integrations |
| GET | `/api/v1/tenants/:tenantId/integrations/:provider` | Get integration details |
| POST | `/api/v1/tenants/:tenantId/integrations/:provider/test` | Test integration connection |
| POST | `/api/v1/tenants/:tenantId/integrations/:provider/sync` | Trigger a data sync |
| GET | `/api/v1/tenants/:tenantId/integrations/:provider/sync-history` | Get sync job history |
| POST | `/api/v1/tenants/:tenantId/integrations/webhook` | Queue an outgoing webhook |
| POST | `/api/v1/integrations/webhooks/process` | Process pending outgoing webhooks |

---

## 19. Analytics & BI

### Event Tracking

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analytics/events` | Track an analytics event |
| GET | `/api/v1/analytics/events` | Get analytics events with filters |
| GET | `/api/v1/analytics/events/aggregate` | Aggregate events by period |

### Reports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/analytics/reports/revenue` | Revenue report |
| GET | `/api/v1/analytics/reports/users` | User analytics |
| GET | `/api/v1/analytics/reports/bookings` | Booking analytics |
| GET | `/api/v1/analytics/summary` | Dashboard summary |
| POST | `/api/v1/analytics/reports` | Create a saved report |
| GET | `/api/v1/analytics/reports/saved` | List saved reports |
| GET | `/api/v1/analytics/reports/:id` | Get saved report |
| POST | `/api/v1/analytics/reports/:id` | Update saved report |
| DELETE | `/api/v1/analytics/reports/:id` | Delete saved report |

### Dashboards

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analytics/dashboards` | Create a dashboard |
| GET | `/api/v1/analytics/dashboards` | List dashboards |
| GET | `/api/v1/analytics/dashboards/:id` | Get dashboard with widgets |
| POST | `/api/v1/analytics/dashboards/:id` | Update dashboard |
| DELETE | `/api/v1/analytics/dashboards/:id` | Delete dashboard |
| POST | `/api/v1/analytics/dashboards/:dashboardId/widgets` | Add widget to dashboard |
| POST | `/api/v1/analytics/dashboards/:dashboardId/widgets/:widgetId` | Update widget |
| DELETE | `/api/v1/analytics/dashboards/:dashboardId/widgets/:widgetId` | Remove widget |

---

## 20. Search & Discovery

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/search/index` | Index a document |
| DELETE | `/api/v1/search/index/:entityType/:entityId` | Remove from index |
| POST | `/api/v1/search/index/bulk` | Bulk index documents |
| GET | `/api/v1/search` | Full-text search |
| GET | `/api/v1/search/autocomplete` | Autocomplete suggestions |
| GET | `/api/v1/search/facets` | Get search facets |
| GET | `/api/v1/search/analytics/popular` | Popular search terms |
| GET | `/api/v1/search/analytics/no-results` | Queries with no results |
| POST | `/api/v1/search/synonyms` | Create search synonym |
| GET | `/api/v1/search/synonyms` | List search synonyms |
| DELETE | `/api/v1/search/synonyms/:id` | Delete search synonym |

---

## 21. AI Platform

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/ai/providers` | List available AI providers |
| POST | `/api/v1/ai/complete` | Generate completion |
| POST | `/api/v1/ai/embed` | Generate embedding |
| POST | `/api/v1/ai/prompts` | Create prompt template |
| GET | `/api/v1/ai/prompts` | List prompt templates |
| GET | `/api/v1/ai/prompts/:slug` | Get prompt by slug |
| POST | `/api/v1/ai/prompts/:slug/render` | Render prompt with variables |
| PUT | `/api/v1/ai/prompts/:id` | Update prompt template |
| DELETE | `/api/v1/ai/prompts/:id` | Delete prompt template |
| POST | `/api/v1/ai/providers/config` | Save provider configuration |
| GET | `/api/v1/ai/providers/config` | Get provider configurations |
| GET | `/api/v1/ai/completions` | Get completion history |
| GET | `/api/v1/ai/usage` | Get AI usage statistics |

---

## 22. Platform Administration

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/settings` | Get all platform settings |
| GET | `/api/v1/admin/settings/:key` | Get a platform setting |
| PUT | `/api/v1/admin/settings/:key` | Set a platform setting |
| DELETE | `/api/v1/admin/settings/:key` | Delete a platform setting |

### Announcements

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/announcements` | Create system announcement |
| GET | `/api/v1/admin/announcements` | List all announcements |
| GET | `/api/v1/admin/announcements/active` | Get active announcements |
| PUT | `/api/v1/admin/announcements/:id` | Update announcement |
| DELETE | `/api/v1/admin/announcements/:id` | Delete announcement |

### Feature Flags

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/feature-flags` | Create feature flag |
| GET | `/api/v1/admin/feature-flags` | List feature flags |
| GET | `/api/v1/admin/feature-flags/:key` | Get feature flag |
| PUT | `/api/v1/admin/feature-flags/:key` | Update feature flag |
| DELETE | `/api/v1/admin/feature-flags/:key` | Delete feature flag |

### Plans & Subscriptions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/plans` | Create plan |
| GET | `/api/v1/admin/plans` | List plans |
| GET | `/api/v1/admin/plans/:id` | Get plan |
| PUT | `/api/v1/admin/plans/:id` | Update plan |
| DELETE | `/api/v1/admin/plans/:id` | Delete plan |
| GET | `/api/v1/admin/quotas/:tenantId` | Get tenant API quota |
| PUT | `/api/v1/admin/quotas/:tenantId` | Update tenant API quota |
| GET | `/api/v1/admin/subscriptions` | List all subscriptions |
| PUT | `/api/v1/admin/subscriptions/:id` | Update subscription |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/stats` | Get platform statistics |

---

## 23. Infrastructure & DevOps

### Deployments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/infra/deployments` | Create a deployment |
| GET | `/api/v1/infra/deployments` | List deployments |
| GET | `/api/v1/infra/deployments/:id` | Get deployment details |
| PUT | `/api/v1/infra/deployments/:id/status` | Update deployment status |

### Environments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/infra/environments` | Create environment |
| GET | `/api/v1/infra/environments` | List environments |
| GET | `/api/v1/infra/environments/:id` | Get environment details |
| PUT | `/api/v1/infra/environments/:id` | Update environment |
| DELETE | `/api/v1/infra/environments/:id` | Delete environment |

### Health & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/infra/health` | Record health check |
| GET | `/api/v1/infra/health/history` | Health check history |
| GET | `/api/v1/infra/status` | Current service status |

### Backups

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/infra/backups` | Create backup |
| GET | `/api/v1/infra/backups` | List backups |
| PUT | `/api/v1/infra/backups/:id/status` | Update backup status |

### Cache

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/infra/cache/clear` | Clear cache |
| GET | `/api/v1/infra/cache/stats` | Cache statistics |

### Overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/infra/overview` | Infrastructure overview |

---

## 24. Security & Compliance

### Policy

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/security/policy/:tenantId` | Get security policy |
| PUT | `/api/v1/security/policy/:tenantId` | Update security policy |
| POST | `/api/v1/security/validate-password` | Validate password against policy |

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/security/api-keys` | Create API key |
| GET | `/api/v1/security/api-keys` | List API keys |
| DELETE | `/api/v1/security/api-keys/:id` | Revoke API key |

### Events & Consent

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/security/events` | Record security event |
| GET | `/api/v1/security/events` | Get security events |
| GET | `/api/v1/security/summary` | Security summary |
| POST | `/api/v1/security/consent` | Record consent action |
| GET | `/api/v1/security/consent/:userId` | Get consent history |

---

## 25. Developer Platform

### Apps

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/developer/apps` | Create developer app |
| GET | `/api/v1/developer/apps` | List developer apps |
| GET | `/api/v1/developer/apps/:id` | Get developer app |
| PUT | `/api/v1/developer/apps/:id` | Update developer app |
| POST | `/api/v1/developer/apps/:id/regenerate-secret` | Regenerate client secret |
| DELETE | `/api/v1/developer/apps/:id` | Delete developer app |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/developer/webhooks` | Create webhook endpoint |
| GET | `/api/v1/developer/webhooks` | List webhook endpoints |
| GET | `/api/v1/developer/webhooks/:id` | Get webhook endpoint |
| PUT | `/api/v1/developer/webhooks/:id` | Update webhook endpoint |
| DELETE | `/api/v1/developer/webhooks/:id` | Delete webhook endpoint |
| POST | `/api/v1/developer/webhooks/:id/trigger` | Test trigger webhook |
| GET | `/api/v1/developer/webhook-logs` | Webhook event logs |
| GET | `/api/v1/developer/webhooks/:id/retries` | Get failed webhook retries |

### Resources & Limits

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/developer/resources` | API resources and info |
| GET | `/api/v1/developer/rate-limit` | Rate limit status |

---

## 26. Marketplace & Plugins

### Listings

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/marketplace/listings` | Create marketplace listing |
| GET | `/api/v1/marketplace/listings` | Get published listings |
| GET | `/api/v1/marketplace/listings/all` | Get all listings (admin) |
| GET | `/api/v1/marketplace/listings/:slug` | Get listing by slug |
| PUT | `/api/v1/marketplace/listings/:slug` | Update listing |
| DELETE | `/api/v1/marketplace/listings/:slug` | Delete listing |
| POST | `/api/v1/marketplace/listings/:slug/download` | Record download |

### Installation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/marketplace/install` | Install plugin |
| GET | `/api/v1/marketplace/installed` | Get installed plugins |
| PUT | `/api/v1/marketplace/installed/:listingSlug/config` | Update plugin config |
| POST | `/api/v1/marketplace/installed/:listingSlug/toggle` | Toggle plugin active state |
| DELETE | `/api/v1/marketplace/installed/:listingSlug` | Uninstall plugin |
| GET | `/api/v1/marketplace/stats` | Marketplace statistics |

---

## 27. Asset Platform Enhanced

### Collections

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/assets/collections` | Create asset collection |
| GET | `/api/v1/assets/collections` | List collections |
| GET | `/api/v1/assets/collections/:id` | Get collection with media |
| PUT | `/api/v1/assets/collections/:id` | Update collection |
| DELETE | `/api/v1/assets/collections/:id` | Delete collection |
| POST | `/api/v1/assets/collections/:collectionId/media` | Add media to collection |
| DELETE | `/api/v1/assets/collections/:collectionId/media/:mediaId` | Remove media from collection |

### Sharing

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/assets/shares` | Create share link |
| GET | `/api/v1/assets/shares` | List share links |
| GET | `/api/v1/assets/shares/:token` | Resolve share token (public) |
| DELETE | `/api/v1/assets/shares/:id` | Deactivate share link |

### Storage

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/assets/storage` | Create storage provider |
| GET | `/api/v1/assets/storage` | List storage providers |
| PUT | `/api/v1/assets/storage/:id` | Update storage provider |
| GET | `/api/v1/assets/storage/stats` | Storage statistics |

### Transforms

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/assets/transforms` | Get transformation presets |
| POST | `/api/v1/assets/transforms/:mediaId` | Transform asset |

---

## 28. BFF - Website

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/bff/website/categories` | Get public categories for website |
| GET | `/api/v1/bff/website/featured` | Get featured tenants for landing page |
| GET | `/api/v1/bff/website/pricing` | Get pricing plans |

---

## 29. BFF - Tenant Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/bff/tenant/:id/summary` | Get tenant dashboard summary |
| GET | `/api/v1/bff/tenant/:id/analytics` | Get tenant analytics (30d) |
| GET | `/api/v1/bff/tenant/:id/integrations` | Get connected integration status |

---

## 30. BFF - Mobile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/bff/mobile/tenant/:slug/manifest` | Get aggregated app manifest for mobile runtime |
| GET | `/api/v1/bff/mobile/discovery` | Get discovery feed (featured + categories) |
| GET | `/api/v1/bff/mobile/tenants/:tenantId/catalog` | Get tenant catalog with products |
| GET | `/api/v1/bff/mobile/profile` | Get aggregated user profile |
| GET | `/api/v1/bff/mobile/notifications` | Get notifications with unread count |

---

## 31. BFF - Business Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/bff/admin/overview` | Get platform overview stats |
| GET | `/api/v1/bff/admin/tenants` | Get paginated tenant list |
| GET | `/api/v1/bff/admin/audit` | Get recent audit logs |

---

## 32. Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check (DB connectivity, uptime) |

---

## Endpoint Summary

| # | Module | Endpoints |
|---|--------|-----------|
| 1 | Auth & IAM | 14 |
| 2 | Profile & Users | 6 |
| 3 | Tenants | 11 |
| 4 | Templates | 3 |
| 5 | Builder (SDUI) | 19 |
| 6 | Renderer | 2 |
| 7 | Commerce | 42 |
| 8 | Media / DAM | 10 |
| 9 | QR Codes | 2 |
| 10 | Discovery | 4 |
| 11 | Admin | 4 |
| 12 | Notifications | 19 |
| 13 | Publishing | 6 |
| 14 | Booking & Scheduling | 35 |
| 15 | Forms & Workflow | 10 |
| 16 | Payments | 12 |
| 17 | Theme | 8 |
| 18 | Integrations | 10 |
| 19 | Analytics & BI | 23 |
| 20 | Search & Discovery | 11 |
| 21 | AI Platform | 13 |
| 22 | Platform Administration | 27 |
| 23 | Infrastructure & DevOps | 18 |
| 24 | Security & Compliance | 11 |
| 25 | Developer Platform | 16 |
| 26 | Marketplace & Plugins | 13 |
| 27 | Asset Platform Enhanced | 17 |
| 28 | BFF - Website | 3 |
| 29 | BFF - Tenant Dashboard | 3 |
| 30 | BFF - Mobile | 5 |
| 31 | BFF - Business Dashboard | 3 |
| 32 | Health | 1 |
| | **TOTAL** | **~381** |
