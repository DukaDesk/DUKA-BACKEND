# Builder Agent Backend TODO

Status: Required hardening follow-up. The merchant builder currently uses the authenticated generic `/api/v1/ai/complete` endpoint for completion; proposal scope checks and design mutation safety currently live in the merchant client.

## Required

- [ ] Add a dedicated `POST /api/v1/ai/builder-agent/plan` endpoint. Derive the user ID from `CurrentUser`; never trust caller-supplied `userId` or `tenantId`.
- [ ] Resolve the caller's active merchant membership and enforce tenant ownership/manager permissions before associating usage or context with a tenant.
- [ ] Keep the DukaDesk Builder Agent system instructions server-owned and immutable from the client. Accept a bounded user request and allowlisted app context, not arbitrary `systemPrompt` values.
- [ ] Return a typed response contract with `scope` (`in_scope`, `out_of_scope`, or `needs_clarification`), concise `reply`, and optional declarative proposal. Do not return executable code.
- [ ] Apply request-size, output-token, provider, rate, and per-tenant usage limits. Do not expose API keys or raw provider diagnostics.
- [ ] Validate proposal component types and props against the published runtime compatibility/component contract before returning a proposal.
- [ ] Record authenticated user/tenant attribution in AI usage logs and define retention/redaction for user prompts and merchant app metadata.
- [ ] Add unit and e2e tests for authentication, tenant scoping, out-of-scope prompts, malformed proposals, prompt-injection attempts, limits, and usage accounting.

## Current client behavior

The merchant editor sends only the user's request and a bounded authoring context to `/api/v1/ai/complete`, does not send identity claims, and does not send customer/order/product records. The client applies its own strict response parsing, registered-component/property allowlist, dangerous-property stripping, proposal size limits, and `ValidationEngine` check. Applying a proposal uses the existing undo-aware design-store loader and remains an explicit merchant action.

This endpoint is a transitional transport, not the target security boundary. The dedicated endpoint above is required before treating the agent prompt policy or tenant usage attribution as server-enforced controls.