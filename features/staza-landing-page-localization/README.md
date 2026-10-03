# staza-landing-page-localization

## Goal

Extend the public Staza landing page to render in English and German using a
single shared page structure. Preserve the existing visual design and keep the
authenticated application unchanged.

## Scope

- English is served at `/`; German is served at `/de/`.
- Translate all landing-page user-facing copy, including navigation, hero,
  section headings and body text, category and quest examples, HTML product
  mockups, footer, accessibility labels, and language-switcher labels.
- Keep the brand name `Staza`, domain `staza.world`, source/provider brands,
  and technical identifiers unchanged.
- Add localized title, description, Open Graph title/description/URL, document
  language, canonical URL, and `en`, `de`, and `x-default` hreflang links.
- Add a simple EN / DE selector in the existing header and footer. Switch
  between corresponding landing URLs and preserve the current page fragment
  where applicable.
- Do not translate the authenticated application, user-generated content, or
  database content. Do not add a CMS, machine translation, or additional
  languages in this milestone.

## Decisions

- Keep one server-rendered vanilla HTML template so localized text and SEO
  metadata are present in the initial response without a client-side
  translation flash.
- Put translations in separate typed English and German modules under
  `src/landing/`, using stable semantic keys such as
  `landing.hero.title`. English is the fallback; no large i18n dependency is
  introduced.
- Explicit URLs select the language. Do not redirect based on browser
  preference and do not persist a language selection; `/` always remains
  English.
- Keep `/app` and `/sign-in` serving the current app shell.
- The approved key terminology is **Sammelobjekt** for “collectible” and
  **Quest** as the product term.

## Approved EN / DE copy

| Context | English | German |
| --- | --- | --- |
| Hero title | Go somewhere worth discovering. | Entdecke Orte, die es wert sind. |
| Hero subtitle | Staza turns real mountain passes, summits, castles, waterfalls and viewpoints into collectibles. Upload a ride, a run or a hike and claim every place you crossed. | Mit Staza werden echte Pässe, Gipfel, Burgen, Wasserfälle und Aussichtspunkte zu Sammelobjekten. Lade eine Rad-, Lauf- oder Wandertour hoch und sichere dir die Orte, die du passiert hast. |
| Primary CTA | Join Early Access — Free | Kostenlosen Early Access sichern |
| World section headline | The world is the game board. | Die Welt ist dein Spielfeld. |
| Quest section headline | Linked regions. Linked rides. | Mehrere Touren. Ein gemeinsames Ziel. |
| Final CTA headline | Your map is still mostly fog. | Auf deiner Karte gibt es noch viel zu entdecken. |

## Localized SEO

- `/` uses `lang="en"`, canonical `https://staza.world/`, and localized English
  title, description, and Open Graph fields.
- `/de/` uses `lang="de"`, canonical `https://staza.world/de/`, and localized
  German title, description, and Open Graph fields.
- Both pages advertise `hreflang="en"`, `hreflang="de"`, and
  `hreflang="x-default"`; x-default points to `/`.
- Do not canonicalize both language pages to one URL.

## Implementation plan

1. Add typed EN/DE dictionaries and a server-side translation lookup / landing
   renderer with English fallback.
2. Convert the existing landing markup to one keyed template, render `/` and
   `/de/`, add localized SEO metadata and header/footer language links, and
   preserve existing app routes.
3. Make landing-only responsive CSS adjustments as needed for longer German
   labels and copy without changing the page design.
4. Add focused tests for both locales, translation-key completeness and
   fallback, switcher destinations, SEO metadata, and app-route preservation.
5. Visually compare desktop and mobile layouts in English and German.

## Acceptance criteria

- `/` returns a complete English landing document and `/de/` a complete German
  landing document, with localized content available in the initial HTML.
- All user-facing landing copy and accessibility labels use stable keys and
  resolve in both dictionaries; missing German keys are detected and unknown
  keys fall back to English.
- The EN / DE selector leads to the other language's corresponding landing
  route and retains a page fragment where applicable.
- Language attributes, localized metadata, canonicals, and hreflang links are
  correct and distinct for the two locales.
- `/app` and `/sign-in` continue to serve the existing app document and
  authenticated routes remain unchanged.
- No new frontend framework, large i18n dependency, automatic browser redirect,
  or persistence mechanism is introduced.
- Desktop and mobile layouts remain consistent with the existing Figma visual
  hierarchy and have no horizontal overflow in either language.

## Constraints and layout risks

The existing landing page is isolated under `public/landing/`, with responsive
breakpoints at 1100px, 860px, and 720px. The hero becomes one column below
1100px. German copy can increase headline and subtitle line counts; the
header's compact action row and current button `white-space: nowrap` behavior
are the highest overflow risks. Adjust only landing styles if necessary so
buttons and cards can grow or wrap naturally. Preserve headline hierarchy and
the current composition; do not redesign the page. The existing Figma landing
page remains the presentation truth.

## Files

- `src/server.ts`
- `src/landing/` locale dictionaries and renderer
- `public/landing/index.html`
- `public/landing/landing.css`
- `src/landingPage.test.ts`

## Validation

- Run focused Vitest tests for localized responses, key resolution/completeness
  and fallback, switcher destinations, metadata, and `/app` and `/sign-in`.
- Retain existing landing-page checks for semantic structure, assets,
  accessibility, and isolation from app bundles and APIs.
- Run the TypeScript build and relevant tests.
- Visually verify desktop and mobile in both languages, including hero and
  button wrapping, responsive navigation, cards, footer, horizontal overflow,
  and browser-console errors.
