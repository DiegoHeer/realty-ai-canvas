# Backend prompt — add `name` to headless signup (extends PR #189)

Copy everything in the fenced block below into a fresh Claude Code session
started in the `realty-alerts` repo.

---

```
We need to extend the existing JWT-auth PR so the mobile app can register users
with a display name and read that name back after login.

## Context
- Repo: realty-alerts. Backend API lives in services/api (Django 6 + Django
  Ninja + django-allauth[headless] 65.18).
- Open PR #189 (branch `worktree-api-jwt-auth`) adds JWT auth INFRASTRUCTURE
  via allauth headless: HEADLESS_ONLY, HEADLESS_CLIENTS=("app",), JWT token
  strategy (RS256, 30min/7day, rotation), endpoints under /_allauth/app/v1/...,
  ACCOUNT_LOGIN_METHODS={"email"}, ACCOUNT_SIGNUP_FIELDS=["email*","password1*",
  "password2*"], ACCOUNT_EMAIL_VERIFICATION="mandatory" (by code), console email
  backend in dev/CI. /v1 endpoints stay PUBLIC. Allauth settings are in
  services/api/realty_api/settings/base.py.

## Goal
The headless signup currently accepts only email + password1 + password2. A
mobile client (separate repo) needs to send a display `name` at signup and get
it back in the user payload returned by login/session. Today the Django User's
first_name/last_name are never populated and the headless user object doesn't
carry a name.

## Requirements
1. Accept a `name` field on the headless signup request and persist it onto the
   Django User. Store the full display name in `first_name` (leave `last_name`
   empty for now). Use the allauth-idiomatic mechanism for adding a custom
   signup field in 65.18 — most likely a custom signup form via ACCOUNT_FORMS
   plus an ACCOUNT_ADAPTER.save_user override. Verify the correct hooks for
   65.18 against the allauth docs before implementing (don't guess the API).
2. Return `name` in the user object that the headless endpoints emit
   (login / session responses), so the client can read it back. This likely
   means customizing the headless user serialization (adapter serialize_user
   or the documented headless equivalent for 65.18). Confirm against the docs.
3. Keep existing validation: email + password1 + password2 still required;
   email-only login method unchanged; mandatory email verification unchanged.
4. Decide and document whether `name` is required or optional at signup. Default
   recommendation: required (the mobile register screen collects it).

## Tests
- Signup with a `name` persists it (first_name) on the created User.
- The user payload returned by login/session includes the `name`.
- Signup still rejects missing email/password and mismatched passwords.
- Follow the existing test style in services/api/tests/ (pytest, the test_user
  / user_headers fixtures added in PR #189).

## Process (per realty-alerts CLAUDE.md)
- Work in a git worktree.
- Before opening/updating the PR: `make test` and `make pre-commit` must pass;
  ruff format + lint and ty typecheck clean.
- Conventional Commits, atomic commits (one logical change each).
- This work extends PR #189 — add commits to the existing branch
  `worktree-api-jwt-auth` (confirm with me before force-pushing or rebasing).
- Pause for my review before committing; after sign-off, push and update the PR.
- Verify the live contract: run the branch locally and capture the actual
  signup request shape + the user-object response (including the new `name`),
  so the exact JSON can be handed to the mobile client.

## Deliverable for the mobile side
After it works, give me the concrete request/response JSON for:
  - POST signup (with name)
  - login
  - the user/session object (showing where `name` appears)
so I can build the mobile auth-client against verified payloads.

Start by exploring services/api (settings, the scraping app, existing tests)
and reading the allauth 65.18 docs for custom signup fields + headless user
serialization. Reach ~95% confidence before implementing; ask me if anything is
ambiguous.
```
