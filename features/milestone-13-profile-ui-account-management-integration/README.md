# Milestone 13: Profile UI & Account Management Integration

## Goal

Add the approved authenticated Profile experience to the vanilla ESM application
without changing authentication, session, WebAuthn, ownership, or progression
semantics. Figma governs presentation; existing account and gameplay systems
remain the source of truth.

## Approved Figma frames

| Frame | Node |
| --- | --- |
| Profile / Overview | `122:7685` |
| Profile / Account | `122:7891` |
| Profile / Passkey | `122:8101` |
| Profile / Delete | `122:8238` |

The frames share a 516px centered content column, four-tab segmented Profile
navigation, dark surface cards, faint borders, 8/12px radii, Barlow Condensed
display typography, DM Mono metadata, yellow progression accents, and red
destructive treatment. Existing design tokens must be reused.

## Scope and decisions

- Reuse the existing sidebar Profile navigation item. Profile Overview is its
  destination; Account, Passkeys, and Delete are local Profile screen states,
  not a new routing system.
- Keep account identity separate from gameplay presentation. Account grouping
  displays email, verification, sessions, passkeys, export, and deletion.
  Gameplay grouping displays the owned Player’s display identity and
  progression/statistics. Do not expose User or Player engineering names.
- `players.display_name` supplies the required display name; derive an initial
  avatar from it. No profile persistence migration is needed.
- Handle, avatar upload/URL, level-name taxonomy, passkey device identity, and
  Figma sample values are unsupported and must be omitted. Render factual
  `Level N`, not invented level titles.
- Achievements, public/social profile features, friends/followers, bio/social
  links, profile discovery, password controls, product-wide naming changes, and
  progression/reward systems are out of scope.

## Canonical overview data

| Field | Source |
| --- | --- |
| Level, current/next XP, progress bar, total XP | Existing `getLevelProgress(players.total_xp)` |
| Distance | Owned `SUM(activities.distance_meters)` |
| Ride count | Owned `COUNT(activities.id)` |
| Found, rare, epic collectibles | Owned distinct `activity_events.source_id` aggregates by rarity |
| Available-collectible denominator | Current configured catalog through `readCollectibles(config.coinsFile)` |

Add one authenticated Player-scoped profile read endpoint and repository
read-model method. It derives ownership from the session, accepts no Player/User
identifier, and reuses canonical progression logic. It must not recompute
progression in the UI or expose another player’s data.

## Account and security integration

Reuse the existing APIs and service semantics:

- session email and safe `email_verified_at` projection;
- `POST /api/auth/logout` and `POST /api/auth/logout-all`;
- passkey list, registration options/verification, and removal endpoints;
- email OTP step-up request and verification endpoints;
- `GET /api/account/export`;
- deletion intent and deletion confirmation endpoints.

The UI must not create a second WebAuthn ceremony, session-revocation path,
export implementation, or direct delete action. It must not expose session
tokens, OTPs, credential IDs, public keys, counters, transports, challenge
data, or security-event details.

Passkeys use existing stored names, created dates, and last-used dates. Default
labels remain `Passkey`; Figma device-name samples must not become inferred
device identities. Existing last-passkey/recent-step-up safeguards remain
authoritative. A small accessible email-code step-up state may be added around
sensitive actions, but it cannot replace canonical safeguards.

Deletion retains the Figma warning hierarchy, checkbox acknowledgement, red
confirmation action, and cancel path while requiring the existing recent
authentication, deletion intent, and confirmation token. The UI makes no
retention or recoverability claims beyond the actual canonical behavior.

## Implementation plan

1. Add typed, owner-scoped Profile overview aggregates and a safe session
   verification-state projection; preserve all existing mutable account routes.
2. Add a Profile component module containing Figma-named overview, account,
   passkeys, and delete render states plus semantic shared patterns:
   ProfileHeader, ProfileProgress, ProfileStats, AccountSection, AccountRow,
   PasskeyRow, DangerZone, and DeleteAccountConfirmation.
3. Add Figma-aligned Profile CSS using current tokens and include it in the
   application entry document.
4. Wire AppShell navigation and the Profile controller to existing CSRF-aware
   fetch, auth reset/sign-in transition, and SimpleWebAuthn registration helper.
5. Implement real loading, disabled, error, cancellation, and retry states
   without mock-data fallbacks.
6. Add repository, frontend controller, and navigation tests.

## Acceptance criteria

- An authenticated account sees only its own display name, progression, activity
  aggregates, and collectible rarity totals; no achievements render.
- Account email and verified state are accurate; logout and logout-all use
  canonical behavior and return to the sign-in flow.
- Passkeys can be listed, added, and removed through the canonical APIs without
  raw credential metadata or invented device labels.
- Export requires existing step-up and downloads the canonical safe payload.
- Delete cancellation leaves the account unchanged; a successful canonical
  deletion signs the account out and prevents subsequent private access.
- Existing OTP, WebAuthn, sessions, CSRF, Player ownership, activity processing,
  progression, replay, world, video, upload, export, and deletion semantics
  remain intact.

## Validation

- Test owner-scoped overview aggregation, distinct collectible/rarity counts,
  configured catalog count, and two-player isolation.
- Test Profile rendering, account verified email, logout/logout-all, export,
  passkey add/remove/error paths, delete cancellation/confirmation/sign-out,
  and no achievement or credential-internal presentation.
- Run `npm test` and `npm run build`.
- Manually validate the Profile, Account, Passkeys, and Delete flows using a
  dedicated test account, including refresh persistence and logout-all.

