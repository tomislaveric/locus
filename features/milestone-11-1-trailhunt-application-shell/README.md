# Milestone 11.1 - Trailhunt application shell

## Goal

Create the Trailhunt desktop visual foundation from the supplied Figma design: design
tokens, the `AppShell`, `Sidebar`, and `MainContent`. This feature introduces no new
product-screen content or domain behavior.

## Figma source and scope

The supplied design file contains one `Home Desktop` page and one `Home` desktop frame
(`1359 × 909`). Its `App Shell` (`1359 × 909`) contains:

```text
App Shell
├── Sidebar (220 × 909)
│   ├── Sidebar / Logo
│   ├── Sidebar / Nav Menu
│   │   ├── Nav Item / Home (Active)
│   │   ├── Nav Item / Rides
│   │   ├── Nav Item / World
│   │   ├── Nav Item / Progress
│   │   └── Nav Item / Profile
│   └── Sidebar / Add Ride CTA
└── Main Content (1139 × 909)
```

The same file has no Ride Detail tab or state frames, other top-level screen frames,
mobile frames, component pages, or named Figma variable collection. `Home Screen`,
`Hero Section`, `Last Ride Section`, and `Next Targets Section` are outside this
feature's scope.

## Decisions

- Preserve the existing static ES-module browser client and Express static-file delivery;
  do not add a UI framework, router, or server/API route.
- Use Figma-derived semantic names: `AppShell`, `Sidebar`, `SidebarLogo`,
  `SidebarNavMenu`, `NavItem`, `AddRideCTA`, and `MainContent`.
- Do not convert generic Figma layers such as `Frame`, `Group`, `Container`, or
  `Rectangle` into code component names.
- Keep the current operational upload/activity interface as legacy content inside
  `MainContent` until the later Home and Add Ride milestones replace it.
- Preserve domain logic, APIs, persistence, progression, activity processing, replay,
  world/collectible logic, upload behavior, video behavior, and synchronization behavior.
- Do not implement Home, Rides, Ride Detail, World, Progress, Profile, Add Ride content,
  or mobile content in this milestone.

## Design foundation

No Figma variable definitions are attached to `App Shell`. The implementation will create
CSS custom properties from its repeated measured styles, named by role:

- canvas, sidebar, and surface backgrounds (`#0d0e10`/`#0f1012`, `#111318`);
- primary, muted, and subtle text (`#ede9e2`, `#737880`, `#3c3f48`);
- yellow brand/active/CTA accent (`#e8b80a`, including the brighter CTA treatment);
- low-alpha border treatment derived from `#737880`;
- Barlow Condensed, DM Mono, and Inter typography roles, subject to verified web-font
  loading or documented fallbacks;
- desktop shell geometry: 220px sidebar, 1139px main column, 100px logo region,
  42px nav items, 44px CTA, 12px nav inset, and designed 28px/18px/16px icon boxes.

## Planned files

Affected existing files:

- `public/index.html` — shell mount point and stylesheet/module links.
- `public/app.js` — shell composition around the unchanged client behavior.
- `src/server.ts` — no change expected; confirm static asset delivery remains sufficient.

New files:

```text
public/components/app-shell.js
public/components/sidebar.js
public/components/main-content.js
public/styles/design-tokens.css
public/styles/app-shell.css
public/assets/logo-full.svg
public/assets/nav-home.svg
public/assets/nav-rides.svg
public/assets/nav-world.svg
public/assets/nav-progress.svg
public/assets/nav-profile.svg
public/assets/add-ride-upload.svg
```

Figma-exported SVG bytes will use the semantic names above, never generated `img*`
identifiers. Shared/duplicate assets may be consolidated behind that same semantic API.

## Implementation plan

1. Verify typography availability and establish Figma-derived design tokens.
2. Add `AppShell`, `Sidebar`, `SidebarLogo`, `SidebarNavMenu`, `NavItem`,
   `AddRideCTA`, and `MainContent` modules with desktop-scoped styles.
3. Download and use the corresponding Figma SVG assets at their designed dimensions.
4. Mount the current client inside `MainContent`, retaining its existing DOM contracts,
   API requests, polling, replay, and progression lifecycle.
5. Verify the `1359 × 909` desktop shell against the Figma `App Shell` reference and
   run focused browser-client and build checks.

## Acceptance criteria

- The app renders the named desktop `AppShell` with a 220px sidebar and 1139px main
  region at the Figma reference size.
- Sidebar logo, navigation items, active state, and Add Ride CTA use the Figma-provided
  SVG sources and intended geometry.
- `MainContent` retains the existing functional upload/activity experience as legacy
  content, without implementing a Figma Home or Add Ride screen.
- No domain, API, persistence, progression, activity, replay, world, upload, video, or
  synchronization behavior changes.
- No responsive/mobile design is invented; this feature remains limited to the provided
  desktop reference.

## Risks and validation

- Future Ride Detail and other screen work requires additional Figma nodes because they
  are absent from the supplied document.
- Reparenting legacy UI can break `querySelector`-based client code, so existing IDs and
  mount order must stay compatible.
- Initial tokens are extracted values rather than Figma-variable bindings and should be
  revisited if authoritative variables are later added.
- Font loading must be verified; Figma font names alone do not prove browser availability.
- Validate the reference desktop geometry, the existing browser-client behavior, and the
  TypeScript build before considering the shell complete.
