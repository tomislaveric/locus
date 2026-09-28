# Milestone 12B: Authentication UI Integration

## Goal

Replace the temporary minimal authentication presentation with the approved
Trailhunt Figma authentication UI. Milestone 12 authentication behavior remains
the canonical source of truth; Figma governs presentation only.

## Scope

- Implement the Figma authentication frames as an isolated UI outside the
  private AppShell.
- Preserve passkey-first discoverable sign-in, email-code fallback,
  registration, passkey setup, session bootstrap, authenticated fetches, and
  private-app navigation.
- Add accessible loading, disabled, success, unavailable, and recoverable-error
  presentation states.
- Add frontend auth UI/controller tests and retain all existing auth security
  coverage.
- Remove only the superseded temporary inline auth presentation and styles.

## Figma frames

The copied `Auth` canvas (`118:6799`) contains:

- `Auth / Session Loading`
- `Auth / Sign In`
- `Auth / Register Email`
- `Auth / Register Email (email filled)`
- `Auth / Verify Email`
- `Auth / Verify Email (code filled)`
- `Auth / Create Passkey`
- `Auth / Successful`
- `Auth / Error`

The canvas has no separate top-level `Auth / Email Code` or `Auth / Passkey
Unavailable` frame. Those canonical states reuse the closest approved email and
error presentation rather than creating a second flow.

## Decisions and constraints

- The server auth service, persistence, WebAuthn ceremonies, OTP behavior,
  sessions, CSRF and Origin protections, rate limiting, ownership, and
  authorization are out of scope and must remain unchanged.
- Passkey is always the primary sign-in action and must invoke the existing
  usernameless WebAuthn login ceremony before collecting an email address.
- Registration retains the canonical sequence: email request, email-code
  verification, User/Player/session creation, passkey setup, then entry to the
  existing private AppShell.
- The registration-email Figma visual is shared by canonical registration and
  email-login request modes with an explicit internal purpose. It does not
  merge or alter their endpoints.
- Generic, enumeration-safe, user-facing error copy maps internal failures to
  Figma-aligned error presentation without exposing credentials, challenges,
  rate limits, account existence, or OTP internals.
- The Figma success screen is shown after successful passkey registration; its
  continue action uses the existing private-app mount path.
- Back actions must not discard an authenticated registration session or
  introduce a new skip path for required passkey setup.

## Implementation plan

1. Retrieve selectable Figma design context for the inspected frames and apply
   any compatible assets, annotations, and token guidance.
2. Replace the inline `public/app.js` auth markup/handlers with a small,
   testable auth-flow controller and Figma-named presentation modules.
3. Build shared layout, branded sign-in, email request, code verification,
   passkey creation, passkey-ready, error, and session-loading views.
4. Add isolated Figma-aligned styles using existing Trailhunt tokens and
   desktop geometry, with mobile-safe width and spacing constraints.
5. Wire every UI action to the existing session, passkey, email-code,
   CSRF-aware fetch, and private-AppShell functions without server changes.
6. Add UI/controller coverage, remove the replaced temporary presentation, and
   run the validation suite.

## Accessibility and responsiveness

Email fields use real labels; code entry is keyboard and paste accessible;
buttons remain semantic and show visible focus; errors/status use live regions;
busy states use disabled controls and status semantics; passkey labels do not
depend only on icons. The desktop Figma composition uses a central 400px content
region and naturally contracts with safe gutters on smaller viewports.

## Acceptance criteria

- Private AppShell content never mounts before session bootstrap resolves and is
  not rendered while unauthenticated.
- Passkey sign-in remains primary and invokes the existing working ceremony.
- Email fallback, registration, OTP verification, passkey setup, success, and
  error transitions preserve current endpoint and account semantics.
- Passkey cancellation, unsupported devices, verification failures, OTP
  failures/expiry, and network failures use safe approved presentation and
  preserve viable retry/fallback actions.
- Loading states prevent accidental duplicate submissions without inventing
  progress values.
- The result closely matches the approved Figma layout, typography, controls,
  spacing, colors, borders, radii, loading state, and brand placement while
  reusing Trailhunt tokens.

## Validation

Run focused frontend auth UI/controller tests, the full existing test suite, and
the TypeScript build. Manually validate passkey sign-in, email-code sign-in,
registration through passkey setup, cancelled passkey, invalid/expired OTP,
recoverable network failures, logout/reload/session bootstrap, desktop fidelity,
and narrow viewport behavior.
