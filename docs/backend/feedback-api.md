# Feedback Submission API — Backend Spec

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`).
**Scope:** add one new, additive endpoint — `POST /v1/feedback` — that accepts free-text
user feedback from the mobile app, optionally attributed to the logged-in user. Nothing
else changes. Companion to [`residences-search-api.md`](./residences-search-api.md); it
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

**Authentication is optional.** Anyone may submit feedback, logged out included. When the
request carries a valid session the server attributes the feedback to that user; otherwise
it is stored anonymously.

---

## User identity ("username when logged in")

The product ask is to *attach the username when the user is logged in*. The app's user
(`AuthUser` in `apps/mobile/src/hooks/use-auth.ts`) is `{ name, email }` — **`email` is the
stable identifier** (there is no separate username field), `name` is for display.

Identity can reach the server two ways. **Prefer (A); (B) is the interim until real auth
ships:**

**(A) Server-derived from the session token — recommended, trustworthy.**
Once real auth exists, the client sends `Authorization: Bearer <token>`; the server derives
the user from it and attaches the verified `email`/`name`/`id` to the stored feedback. The
client sends **no** identity in the body. This is the only attribution the user cannot
forge.

**(B) Client-supplied `user` in the body — interim, untrusted.**
There is **no auth backend yet** — `use-auth` is a mock local session (its header comment:
*"Swap the helper bodies for real network calls later"*). Until tokens exist, the client
may include the logged-in user's identity in the body as a **best-effort, unverified** hint:

```jsonc
{ "message": "…", "user": { "email": "jane@example.com", "name": "Jane Doe" } }
```

Treat this as spoofable — feedback attribution is low-stakes, so never use it for
authorization. **Precedence:** if a verified token *and* a body `user` are both present, the
**token wins** (the server overwrites the body `user`). When logged out, the client omits
`user` and the submission is anonymous.

This mirrors the spec's recurring pattern — *ship the forward-compatible contract now,
serve today's reality* (cf. the `deal_type` / `format` "reserved value" decisions).

---

## Request body — `FeedbackIn`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `message` | string | **yes** | trimmed length 1–5000 | The feedback text. The client already blocks submit on an empty field. |
| `user` | object | no | `{ email, name? }` | Logged-in user, option **(B)**. Omit when anonymous; **ignored** when a token already identifies the user (option **A**). |
| `user.email` | string | no | valid email | The identifier ("username"). |
| `user.name` | string | no | ≤ 200 chars | Display name. |
| `app_version` | string | no | ≤ 20 chars | e.g. `1.4.0`; the app has it via `expo-constants`. Telemetry only — never branch behaviour on it. |
| `platform` | enum | no | `ios \| android \| web` | Where it was sent from. |
| `locale` | enum | no | `en \| nl \| pt` | The app's active language, to triage non-English feedback. |

> Every field except `message` is optional. Ignore unknown fields (forward-compat).

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
state), so the body can stay minimal. `202 Accepted` is equally fine if the write is
queued. The `id` is handy for support correlation.

### Errors

- **`422`** — `message` missing/blank/too long, or a bad `platform` / `locale` /
  `user.email`. Same validation path as the other endpoints
  ([residences §11](./residences-search-api.md#11-validation--errors)).
- **`401`** — only if a **malformed/expired** `Authorization` token is sent. A **missing**
  token is *not* an error (anonymous is allowed).
- **`429`** — recommended: the endpoint is public, so rate-limit per IP (and per user when
  known) to deter spam.

---

## Storage & handling (suggestion)

Persist one row per submission: `id`, `message`, nullable `user_email` / `user_name`
(null = anonymous), `app_version`, `platform`, `locale`, `created_at`, plus
server-captured `ip` / `user_agent` for abuse triage. Optionally fan out a notification
(email/Slack) on insert so feedback is seen promptly. The exact storage and notification
are the backend's call — this spec only fixes the request/response contract.

---

## Client wiring (our side, FYI)

A `submitFeedback(input)` will live in `packages/data/src/client.ts`, POSTing through the
existing `request()` wrapper (it already sets `Content-Type`; a future auth layer adds the
`Authorization` header centrally). Note `request()` is **GET-only today** — the call passes
`{ method: 'POST', body: JSON.stringify(input) }`. The feedback screen's current dummy
`setTimeout` is swapped for this call, and its idle → sending → sent button states map
directly onto the request lifecycle (in-flight → `201`).

---

## OpenAPI delta (drop-in)

```yaml
paths:
  /v1/feedback:
    post:
      summary: Submit user feedback
      security: []            # anonymous allowed; a bearer token (once auth lands) is optional and used only for attribution
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
        '422': { description: Validation error }
```

```yaml
components:
  schemas:
    FeedbackIn:
      type: object
      required: [message]
      properties:
        message:     { type: string, minLength: 1, maxLength: 5000 }
        user:
          type: object
          properties:
            email: { type: string, format: email }
            name:  { type: string, maxLength: 200 }
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
