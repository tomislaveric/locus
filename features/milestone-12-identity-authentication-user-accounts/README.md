# Milestone 12: Identity, Authentication & User Accounts

## Goal

Introduce production-capable identity and account infrastructure while keeping
authentication identity separate from gameplay state. A User owns exactly one
Player in v1; the Player continues to own XP, activities, collectibles,
progression, and world discoveries.

Passkeys are the primary sign-in method. Verified email one-time codes provide
registration verification, fallback sign-in, and recovery. Passwords, SMS,
social/OAuth sign-in, organizations, teams, broad roles, public profiles,
friends, and Profile UI are out of scope.

## Current-state constraints

- The application has no existing authentication, sessions, cookies, CSRF
  protection, email sender, or security middleware.
- `players` currently stores the single default local player, and
  `activities.player_id` owns activity/event/video gameplay state.
- `ActivityRepository` and all gameplay routes are currently bound to
  `DEFAULT_PLAYER_ID`. The migration must replace this with a session-derived,
  owned Player without changing gameplay semantics.
- PostgreSQL migrations are ledger-backed and execute transactionally.
- The frontend is a vanilla ESM application that currently mounts the private
  application shell immediately.

## Decisions

### Identity and migration

- Add `users`, retaining players as gameplay-only records.
- Enforce `users 1:1 players` with `players.user_id`, a foreign key, and a
  unique constraint after the safe transition.
- Never silently assign a pre-existing production Player to a new User.
  Existing unowned Players and their activities remain intact but inaccessible
  through authenticated APIs until an explicit data migration is run.
- Development-only bootstrap configuration may create or link a known
  development User and Player; it is rejected in production.
- User creation and first Player creation occur in one transaction.
- Canonical email normalization trims surrounding whitespace and case-folds;
  it does not apply provider-specific dot or plus-address transformations.

### Migrations

1. `006_users_and_player_ownership` creates `users`, adds nullable
   `players.user_id`, and prepares unique ownership safely.
2. `007_auth_credentials_and_sessions` creates passkey, challenge, email-code,
   opaque session, security-event, and targeted rate-limit persistence with
   expiry and lookup indexes.
3. `008_account_lifecycle` creates deletion intent and narrowly retained media
   cleanup task support.

All migrations are additive and forward-only under the existing migration
ledger. The non-null ownership requirement is applied only once explicit legacy
ownership handling has completed.

### Dependencies

- `@simplewebauthn/server` and `@simplewebauthn/browser` handle mature,
  standards-based WebAuthn verification and browser ceremonies. No WebAuthn
  cryptography is hand-written.
- `helmet` provides configured Express security headers.
- `express-rate-limit` provides targeted endpoint throttling, paired with
  repository/DB state where durable cross-process enforcement is required.
- Node's `crypto` provides cryptographically secure randomness and hashing.

Exact package versions, scope, and maintenance rationale are documented when
dependencies are introduced.

## Authentication design

### Passkeys

Passkeys are registered and authenticated with server-persisted, cryptographically
random, short-lived, single-use challenges. The server verifies expected RP ID,
configured origin, user verification, credential ownership, credential counter,
and library-provided transport/device/back-up metadata. Trusted origin data is
never taken from request headers.

Users may register, list, name, and remove multiple passkeys. Removing the last
passkey requires recent step-up authentication and leaves verified email fallback
available. Usernameless/discoverable login is used where the browser supports it;
compatibility does not depend on conditional mediation.

### Email one-time codes

Email codes are a fallback and recovery mechanism, not the primary login
method. Codes are generated with cryptographically secure randomness, stored
only as a hash, expire after ten minutes, allow five verification attempts, and
are single-use. Resending invalidates the active code. Request, verification,
and recovery flows are rate limited by applicable email/account, session/context,
and IP dimensions.

Code request responses use generic wording and do not reveal account, passkey,
or account-status information. Plaintext OTPs are never persisted or logged in
production. A development-only sender can expose a code through controlled
non-production test/log infrastructure.

An `EmailSender` boundary exposes authentication-code and security-notification
operations. Auth services do not call an email provider directly.

### Registration and fallback flows

Registration requests and verifies an email code, then transactionally creates
or activates one User and one Player, creates a fresh session, and prompts for
the first passkey. Repeated requests are idempotent and a verified existing
email never creates duplicate Users or Players.

Fallback login verifies an email code and issues a fresh session. It does not
block access when passkeys exist; accounts without a passkey are encouraged to
add one.

## Session, transport, and CSRF

Sessions are server-side opaque records. A browser receives a 256-bit random
token in a `__Host-session` cookie while PostgreSQL retains only a SHA-256 token
hash. Successful authentication and reauthentication rotate sessions. Sessions
have a seven-day idle timeout, 30-day absolute lifetime, and a `last_seen_at`
write rate limited to once per fifteen minutes. Logout revokes the current
session; logout-all revokes every user session.

Production cookies are `HttpOnly`, `Secure`, `Path=/`, and `SameSite=Lax`.
Production startup requires validated HTTPS and explicit
`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, and `WEBAUTHN_ORIGIN`; localhost-only
development exceptions are explicit.

All state-changing cookie-authenticated routes require a session-bound random
CSRF token in `X-CSRF-Token` and pass same-origin Origin validation. Auth
ceremony endpoints validate origin and their own server-side flow challenges.
SameSite is defense in depth, not the CSRF control.

`optionalUser`, `requireUser`, and `requirePlayer` centralize session validation
and User-to-Player resolution. Route handlers do not independently recreate
authentication or ownership logic.

## Authorization migration

The repository API changes from a constructor-held default Player to methods
that receive a Player derived by trusted middleware. The browser never submits a
Player ID for authenticated gameplay actions.

`requirePlayer` protects activity import/list/read, activity-video attach,
render, removal, preview, and download; Player progress and dashboard; world
discovery snapshots; and job lifecycle access. Every activity/video query
continues to constrain by the authenticated Player ID. Job records gain player
ownership so token knowledge alone is insufficient.

This preserves FIT processing, exactly-once XP, replay, collected and near-miss
data, activity history, late video attachment, Home, Progress, and World
behavior for each authenticated Player.

## API surface

Implement:

- `POST /api/auth/register/code`
- `POST /api/auth/register/verify`
- `POST /api/auth/passkeys/register/options`
- `POST /api/auth/passkeys/register/verify`
- `POST /api/auth/passkeys/login/options`
- `POST /api/auth/passkeys/login/verify`
- `POST /api/auth/email-code/request`
- `POST /api/auth/email-code/verify`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/passkeys`
- `DELETE /api/auth/passkeys/:id`
- minimal step-up, JSON export, and account-deletion-intent/confirmation APIs.

Authentication responses are enumeration-safe. Sensitive actions require fresh
step-up authentication: passkey assertion where available or fresh email OTP
under documented recovery rules.

## Account lifecycle and privacy

Authenticated, step-up-protected data export returns account identity, Player
data, activities, events including location history, progression, discoveries,
and safe metadata. It never includes sessions, tokens, OTPs, WebAuthn internals,
or other users' data.

Deletion first creates a short-lived intent. Completion requires fresh step-up
authentication and explicit confirmation, revokes access immediately, collects
media paths, deletes User/Player/activity/passkey/session/recovery records, and
reliably retries filesystem media cleanup through a minimal deletion task. The
operation is idempotent and does not invent a legal retention obligation.

Used and expired challenges/codes are promptly removed. Expired and revoked
sessions, cleanup metadata, and minimal security events have explicit,
time-bounded operational retention. Security events record account, passkey,
login, fallback, logout-all, and deletion outcomes without secrets, tokens,
OTP content, credential payloads, or GPS traces.

Email change UI is deferred. The implementation establishes a service/schema
boundary for verified-new-email change and old-address security notification.

## UI

The frontend bootstraps the current session before rendering private content:
`UNKNOWN`, `AUTHENTICATED`, and `UNAUTHENTICATED`. Unauthenticated visitors see
a token-consistent minimal sign-in experience with a passkey-first action, email
code fallback, registration verification, passkey setup, loading, expiry, and
error states. An authenticated fetch helper supplies CSRF tokens.

No Profile redesign is included. The existing application shell is rendered
only after authentication resolves.

## Security controls and threat model

`helmet` is configured with production HSTS, no-sniff, referrer policy, frame
protection, and a CSP validated against the static application.

| Threat | Mitigation |
| --- | --- |
| Account enumeration | Generic code-request responses and restricted authenticated disclosure |
| OTP brute force | Short TTL, hashing, attempt limits, invalidation, and scoped rate limits |
| OTP interception and phishing | HTTPS, passkey-first UX, recovery throttles, and security events |
| Session theft or fixation | Opaque hashed tokens, secure cookies, rotation, expiry, and revocation |
| CSRF | Session-bound token plus Origin validation |
| Cross-user access | Central middleware, player-constrained SQL, owner-scoped jobs, isolation tests |
| Credential replay | Single-use challenges, expiry, RP/origin verification, and counters |
| Stolen email fallback | Fresh recovery rules, rate limits, step-up, and notifications |
| Lost passkey/device | Verified email fallback and multiple passkeys |
| Authenticated malicious uploads | Existing input controls plus authenticated Player ownership |
| GPS and log leakage | Private owner-scoped APIs; no full traces, OTPs, tokens, or credential payloads in logs |
| Duplicate accounts | Canonical-email uniqueness and User/Player transactions |

These technical measures support data minimization, purpose limitation, storage
limitation, integrity, confidentiality, and privacy by default. They do not make
the product automatically GDPR compliant; legal basis, notices, subject-request
processes, vendor agreements, incident response, and retention governance remain
organizational work.

## Implementation plan

1. Add configuration validation, dependencies, auth types, repositories,
   email abstraction, and migrations.
2. Implement OTP, passkey challenge/verification, sessions, targeted limits,
   audit events, cleanup, and account lifecycle services.
3. Add security headers, middleware, CSRF/origin enforcement, auth routes, and
   owner-scoped job records.
4. Refactor gameplay repository and routes to accept middleware-derived Players.
5. Add session bootstrap, authentication UI, and CSRF-aware frontend fetches.
6. Add documentation for architecture, flows, environment, local setup,
   retention, deletion, export, production assumptions, and remaining legal work.

## Acceptance criteria and validation

- A new verified email creates exactly one User and one Player transactionally.
- Passkey registration/login validates configured RP/origin/challenge ownership;
  multiple passkeys work.
- Email fallback works without passwords and remains enumeration-safe.
- Sessions rotate on authentication, honor idle/absolute expiry, and revoke on
  logout/logout-all.
- All state-changing authenticated routes enforce CSRF and ownership.
- Two users cannot read, mutate, attach media to, or obtain progress/world/job
  data for each other.
- Existing activity import, FIT processing, XP, replay, collected data,
  near-misses, video flows, activity history, Home, Progress, and World retain
  behavior for the authenticated owner.
- Export and deletion require step-up authentication; deletion revokes access
  and removes account/gameplay/authentication data and associated media.

Automated coverage includes registration transactionality; OTP invalid, expired,
reused, attempt-limit, rate-limit, and enumeration cases; WebAuthn options and
verification failures; session/cookie/CSRF behavior; and mandatory two-user
isolation across all protected resources. Existing persistence and gameplay
tests are updated to use explicit Players. Manual validation covers new-user,
returning-passkey, email-fallback, two-user, reload, and logout flows.

## Rollout risks

The key migration risk is replacing global default-player state and bearer-like
job tokens with authenticated owner-scoped access. Nullable legacy ownership,
explicit development bootstrap, route-by-route ownership constraints, and
multi-user integration tests prevent accidental assignment and cross-user data
access. Database migrations remain forward-only; code can roll back before the
ownership non-null enforcement, but production legacy-player association requires
an explicit operational decision.
