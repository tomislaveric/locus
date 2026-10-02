# milestone-16-0-staza-landing-page

## Goal

Add a public Staza marketing page at `/`, faithfully based on Figma node
`129:4`, while keeping the existing authenticated application separate and
unchanged in behavior.

## Scope

- Build the landing page as standalone vanilla HTML, CSS, and JavaScript under
  `public/landing/`.
- Serve the landing page at `/`; keep the existing `public/index.html` app
  document available at `/app` and `/sign-in`.
- Reuse existing Staza branding and design tokens read-only. Keep landing
  styles and assets local to the landing folder.
- Recreate the Figma sections: navigation and hero; collectible categories;
  how it works; quests; activity-log mockup; progression; real-place cards;
  outdoor imagery; final CTA; and footer.
- Keep map, quest, activity, and progression visuals static and presentation
  only. Do not load MapLibre or call World APIs from the landing page.
- Add responsive layouts, SEO metadata, accessibility behavior, and focused
  tests.

## Decisions

- **Page isolation:** Add `public/landing/index.html`, `landing.css`,
  `landing.js`, and `assets/`. Do not replace or move the existing
  `public/index.html`, or modify `public/app.js`, app components, or shared
  styles/tokens.
- **Routes:** Register `/` to serve the landing document, and `/app` plus
  `/sign-in` to serve the existing app document, before Express static
  middleware. Preserve API and authentication behavior.
- **Early access:** Link “Sign in” and “Join/Get Early Access” to the existing
  `/sign-in` flow. Do not add a waitlist backend or new authentication behavior.
- **Marketing claims:** Use neutral copy and omit Figma's unsupported location
  totals, country counts, stale 2025 launch date, and unverified testimonials.
  Remaining figures inside clearly illustrative static product mockups are
  presentation data, not live product claims.
- **Footer:** Link available product sections to page anchors. Show unavailable
  Company and Legal destinations as non-interactive text.
- **Brand assets:** Reuse `/assets/logo-full.svg` and `/assets/favicon.svg`.
  Bundle required Figma photos and vectors locally; never use the Figma
  screenshot itself as page artwork.
- **Typography:** Reuse existing Barlow Condensed, Inter, and DM Mono token
  stacks. No local font files or font-loading links were found, so existing
  fallback behavior remains unless approved local fonts are added separately.
- **Framework:** No new frontend framework or router.

## Design notes

- The desktop Figma frame is 1359px wide, with a 64px header, approximately
  1280px content width, and section spacing around 100px.
- The hero headline and static product/map illustration establish the primary
  composition. The collection and data sections use card grids; how-it-works
  and quest/progression sections have their own distinct layouts; the photo
  gallery uses three Figma images.
- Maintain the Staza dark outdoor palette, restrained yellow accent, subtle
  borders, and display/body/mono type hierarchy. Add any landing-only palette
  values in the landing stylesheet, not the shared app token file.

## Implementation plan

1. Add isolated landing markup, scoped styling, and light client-side behavior
   under `public/landing/`.
2. Add explicit Express page routes for `/`, `/app`, and `/sign-in` before the
   existing static middleware; leave all API and shared-library routes intact.
3. Bundle the Figma's required photo/vector assets locally and reuse existing
   logo and favicon assets.
4. Implement responsive behavior: preserve desktop composition; contract
   tablet layouts; stack content on mobile; keep navigation and CTAs accessible
   without horizontal overflow.
5. Add title, description, canonical URL (`https://staza.world/`), Open Graph
   title/description, suitable local `og:image` if available, theme-color, and
   favicon metadata.
6. Apply semantic landmarks and heading order, keyboard-operable links and
   mobile navigation, visible focus, useful photo alt text, decorative-image
   hiding, adequate contrast, and reduced-motion handling.
7. Add focused tests for landing markup/links/session independence and for
   route responses that preserve the existing app shell.

## Acceptance criteria

- `/` returns the standalone landing page without requiring a session or
  requesting `/api/auth/session`.
- Header/footer section links target existing page sections; sign-in and early
  access CTAs reach the existing auth flow.
- `/app` and `/sign-in` serve the original app document and preserve its auth
  bootstrap and authenticated routes.
- The landing page does not load MapLibre, query World APIs, or import
  authenticated app business logic.
- Desktop, tablet, and mobile layouts preserve the Figma hierarchy, avoid
  horizontal overflow, and maintain accessible controls and focus behavior.
- Metadata and local asset references are correct; no fake ratings, reviews,
  or unsupported marketing claims are shown.
- No changes are made to collectible logic, quests, World behavior, activity
  processing, progression, persistence, authentication semantics, or importers.

## Validation

- Run focused Vitest coverage for public markup, navigation, CTA destinations,
  session independence, and `/`, `/app`, and `/sign-in` routing.
- Run the TypeScript build and relevant existing tests.
- Compare the rendered page with Figma at approximately 1440px desktop, 1024px
  tablet, and 390px mobile. Check headline wrapping, spacing, imagery, cards,
  footer, overflow, layout stability, and browser-console errors.
- Browser/E2E tooling is not currently declared; use existing browser
  screenshot tooling if available and otherwise document the manual viewport
  checks.
