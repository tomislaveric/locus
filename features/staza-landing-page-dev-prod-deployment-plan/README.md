# staza-landing-page-dev-prod-deployment-plan

## Goal

Deploy only the public Staza landing page to shared hosting over SSH, with
separate DEV and PROD GitHub Actions workflows.

## Scope

- Create `.github/workflows/deploy-landing-dev.yml` and
  `.github/workflows/deploy-landing-prod.yml`.
- Add a dependency-free static exporter that renders the existing English and
  German landing templates for a static host.
- Add concise documentation for GitHub Environment configuration and safe
  remote deployment.
- Do not deploy the Staza app, VPS, PostgreSQL, backend services,
  Docker/Kubernetes, or any other application service.

## Decisions

- The checked-in `public/landing/index.html` is rendered by the application
  server and contains `{{landing.*}}` placeholders. Static export must render
  both locales before upload; no runtime application server is deployed.
- Keep the export dependency-free, reusing the existing landing localization
  renderer from a Node 22 script. This is a static template-export step, not an
  application build. Workflows do not run npm install, application
  compilation, or the backend test suite.
- Preserve current absolute URLs. The English page is served at `/`, the
  German page at `/de/`, landing styles/scripts/assets at `/landing/...`, and
  the explicitly referenced logo and favicon at `/assets/...`.
- `public/styles/` is not referenced by the landing page and is not deployed.
  Only `public/landing/` and the two referenced files from `public/assets/` are
  staged.
- DEV reacts to changes under `public/landing/**`, `src/landing/**`, and the
  static export script `scripts/export-landing.mjs`.
- PROD reacts only to published GitHub Releases with tags matching
  `^staza-[0-9]+\.[0-9]+\.[0-9]+$`. Deploy the exact tag only if its commit is
  reachable from `main`.
- Keep real credentials out of the repository and do not populate secrets via
  GitHub CLI.

## Static artifact

Generate a temporary directory under `$RUNNER_TEMP` containing only:

```text
<staging>/
  index.html
  de/
    index.html
  landing/
    landing.css
    landing.js
    assets/
  assets/
    favicon.svg
    logo-full.svg
```

`index.html` and `de/index.html` are rendered from the shared template with all
placeholders resolved. Copy the landing directory contents and the two shared
assets explicitly referenced by the HTML; do not upload unrelated repository
files or other `public/assets/` content.

## Implementation plan

1. Add `scripts/export-landing.mjs` to reuse the existing landing renderer,
   emit the English and German pages and stage only the required files.
2. Add export-focused checks for complete localization, no unresolved
   placeholders, and presence of all staged URL dependencies.
3. Add `.github/workflows/deploy-landing-dev.yml`:
   - Trigger on `push` to `main` with paths for `public/landing/**`,
     `src/landing/**`, and `scripts/export-landing.mjs`.
   - Use `landing-dev`, expose `vars.LANDING_PUBLIC_URL`, and deploy the
     generated stage.
   - Use the `landing-dev` concurrency group with
     `cancel-in-progress: true` so a newer main push supersedes an older DEV
     deployment.
4. Add `.github/workflows/deploy-landing-prod.yml`:
   - Trigger on `release` publication, not arbitrary tag pushes.
   - Validate the tag against `^staza-[0-9]+\.[0-9]+\.[0-9]+$`; reject
     malformed tags before deployment.
   - Check out the exact release tag and verify its commit is an ancestor of
     `origin/main`; never substitute current HEAD or another branch.
   - Use `landing-prod` and expose `vars.LANDING_PUBLIC_URL`.
   - Use the `landing-prod` concurrency group with
     `cancel-in-progress: false`; do not cancel an active production deploy.
5. Validate required configuration, SSH connectivity, and the remote path
   before syncing. Fail on missing values or any SSH/rsync/tag/ancestry error.
6. Add concise environment setup instructions to the feature documentation.

## Environments and manual configuration

Create GitHub Environments `landing-dev` and `landing-prod`. The exact planned
CLI commands are:

```bash
gh api --method PUT repos/tomislaveric/locus/environments/landing-dev --input - <<< '{}'
gh api --method PUT repos/tomislaveric/locus/environments/landing-prod --input - <<< '{}'
gh variable set LANDING_SSH_PORT --env landing-dev --body 22
gh variable set LANDING_SSH_PORT --env landing-prod --body 22
```

Do not execute these until implementation approval. Do not create or set
secrets using the CLI.

Configure these secrets separately on each environment:

- `LANDING_SSH_HOST`: shared-host SSH hostname.
- `LANDING_SSH_USER`: SSH account username.
- `LANDING_SSH_PRIVATE_KEY`: private key authorized for that account.

Configure these variables separately on each environment:

- `LANDING_REMOTE_PATH`: existing dedicated absolute landing webroot.
- `LANDING_PUBLIC_URL`: public environment URL shown in GitHub deployments.
- `LANDING_SSH_PORT`: SSH port, with the planned default of `22`.

Use distinct host paths and public URLs for DEV and PROD. Any optional PROD
reviewers or protection rules are configured manually in GitHub; the planned
commands do not configure them.

## SSH and rsync safety

- Write the private key to a temporary runner file with restrictive mode `600`
  and never print secret values.
- Use `ssh-keyscan` for the configured host and port to populate a temporary
  `known_hosts`, then connect with `StrictHostKeyChecking=yes`. Never disable
  host-key checking globally.
- Require `LANDING_REMOTE_PATH` to be an absolute dedicated directory; reject
  `/`, the remote home directory, and traversal components. Verify it exists
  over SSH before syncing. Do not automatically create a missing directory.
- Sync only `<staging>/` to
  `$LANDING_SSH_USER@$LANDING_SSH_HOST:$LANDING_REMOTE_PATH/` using SSH on the
  configured port and `rsync -az --delete`.
- `--delete` removes stale files only inside that validated remote landing
  webroot; it must never target the home directory or a broader path.

## Acceptance criteria

- A dependency-free export produces a standalone English page at `/` and
  German page at `/de/`, with no unresolved `{{landing.*}}` placeholders.
- The staged artifact contains only the two localized pages, `public/landing`
  supporting files, and the referenced logo/favicon.
- DEV deploys only for relevant `main` changes and does not run for unrelated
  repository changes.
- PROD deploys only published releases with exact `staza-MAJOR.MINOR.PATCH`
  tags whose commit is reachable from `main`; it checks out that exact tag.
- Each workflow uses the correct GitHub Environment and dynamically exposes
  the URL from `LANDING_PUBLIC_URL`.
- Missing/invalid configuration, SSH authentication/connectivity failure,
  invalid/missing remote directory, tag validation failure, ancestry failure,
  or rsync failure produces a failed workflow.
- No app/VPS/backend/database/container deployment is added.

## Validation and limitations

- The repository has focused landing and localization tests
  (`src/landingPage.test.ts` and landing locale tests). They are useful local
  checks, but the deployment workflows do not install npm dependencies or run
  them.
- Validate both exported documents, placeholder resolution, and staged asset
  references without adding a build pipeline.
- `rsync --delete` is destructive within the configured webroot. There is no
  automated rollback or version retention; an interrupted/failed sync may
  require manual recovery from a host-side backup.
