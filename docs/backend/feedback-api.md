# Feedback Submission API — Backend Spec

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`).
**Scope:** add one new, additive endpoint — `POST /v1/feedback` — that accepts free-text
user feedback from the mobile app, attributed to the logged-in user via their **JWT** when
present. Nothing else changes. Companion to [`residences-search-api.md`](./residences-search-api.md); it
follows that spec's [§10 versioning](./residences-search-api.md#10-versioning-migration--compatibility)
and [§11 validation/errors](./residences-search-api.md#11-validation--errors) conventions.

> **Status:** the feedback screen already exists in the app
> (`apps/mobile/src/app/settings/feedback.tsx`) but its submit is a **dummy** — no network
> call yet. This spec defines the endpoint it should call; wiring the client is our side
> (see [Client wiring](#client-wiring-our-side-fyi)).

---

## Endpoint

```
POST /v1/feedback
```

A new, additive route. **No `api_version` gate** — there is no legacy contract to preserve
for a brand-new endpoint (unlike `/v1/residences`, see its §10); just keep it under `/v1`
for consistency. `Content-Type: application/json`.

**Authentication is via JWT and optional here.** Anyone may submit feedback, logged out
included. When the request carries a valid `Authorization: Bearer <JWT>`, the server
attributes the feedback to that user; with no token it is stored anonymously.

---

## User identity (from the JWT)

API calls authenticate with a **JWT bearer token**, so feedback identity comes from that
token — never from the request body:

- **Logged in** → the client sends `Authorization: Bearer <JWT>`. The server validates the
  token (signature + expiry) and derives the user from its claims: **`email` is the
  identifier ("username")**, `name` is for display (the app's `AuthUser` is `{ name, email }`
  — see `apps/mobile/src/hooks/use-auth.ts`). It attaches that **verified** identity to the
  stored feedback.
- **Logged out** → no token; the feedback is stored anonymously.

Because identity is read from the signed token and **not** from the body, a client cannot
assert who it is — attribution is always trustworthy. The app uses a mock local session
today (`use-auth`: *"Swap the helper bodies for real network calls later"*); once JWT auth
lands, the token is attached centrally in the client's `request()` wrapper, so this
endpoint needs no per-call identity handling.

---

## Request body — `FeedbackIn`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `message` | string | **yes** | trimmed length 1–5000 | The feedback text. The client already blocks submit on an empty field. |
| `app_version` | string | no | ≤ 20 chars | e.g. `1.4.0`; the app has it via `expo-constants`. Telemetry only — never branch behaviour on it. |
| `platform` | enum | no | `ios \| android \| web` | Where it was sent from. |
| `locale` | enum | no | `en \| nl \| pt` | The app's active language, to triage non-English feedback. |

> Only `message` is required. **No identity field** — the user comes from the JWT (above).
> Ignore unknown fields (forward-compat).

---

## Response

**`201 Created`** with a minimal acknowledgement:

```jsonc
{
  "id": "fb_01HZ…",                 // server-assigned id
  "created_at": "2026-06-28T10:00:00Z"
}
```

The client only needs to know it succeeded (it flips the button to a "Feedback sent"
state), so the body stays minimal. The `id` is handy for support correlation.

### Errors

- **`422`** — `message` missing/blank/too long, or a bad `platform` / `locale`. Same
  validation path as the other endpoints
  ([residences §11](./residences-search-api.md#11-validation--errors)).
- **`401`** — a **malformed or expired** JWT. A **missing** token is *not* an error
  (anonymous is allowed).
- **`429`** — the endpoint is public, so rate-limit per IP (and per user when the JWT
  identifies one) to deter spam.

---

## Storage & handling

Persist one row per submission: `id`, `message`, nullable `user_email` / `user_name`
(null = anonymous), `app_version`, `platform`, `locale`, `created_at`, plus
server-captured `ip` / `user_agent` for abuse triage. Fan out a notification (email/Slack)
on insert so feedback is seen promptly.

---

## Client wiring (our side, FYI)

A `submitFeedback(input)` will live in `packages/data/src/client.ts`, POSTing through the
existing `request()` wrapper. `request()` is **GET-only today** — the call passes
`{ method: 'POST', body: JSON.stringify(input) }`; the `Authorization: Bearer <JWT>` header
is added centrally in `request()` once auth lands, so `submitFeedback` sends no identity
itself. The feedback screen's current dummy `setTimeout` is swapped for this call, and its
idle → sending → sent button states map directly onto the request lifecycle (in-flight → `201`).

---

## OpenAPI delta (drop-in)

```yaml
paths:
  /v1/feedback:
    post:
      summary: Submit user feedback
      security:
        - {}              # anonymous allowed
        - bearerAuth: []  # logged-in: identity is taken from the JWT
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FeedbackIn' }
      responses:
        '201':
          description: Feedback stored
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FeedbackAck' }
        '401': { description: Invalid or expired token }
        '422': { description: Validation error }
```

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    FeedbackIn:
      type: object
      required: [message]
      properties:
        message:     { type: string, minLength: 1, maxLength: 5000 }
        app_version: { type: string, maxLength: 20 }
        platform:    { type: string, enum: [ios, android, web] }
        locale:      { type: string, enum: [en, nl, pt] }
    FeedbackAck:
      type: object
      required: [id, created_at]
      properties:
        id:         { type: string }
        created_at: { type: string, format: date-time }
```
