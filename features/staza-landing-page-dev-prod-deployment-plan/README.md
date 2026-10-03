# staza-landing-page-dev-prod-deployment-plan

## Goal

Deploy only the public Staza landing page to shared hosting over SSH, with
one GitHub Actions workflow that targets separate DEV and PROD environments.

## Scope

- Create `.github/workflows/deploy-landing.yml` with automatic DEV deployments
  for relevant `main` changes and a manual DEV/PROD environment selector.
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
- Relevant pushes to `main` deploy to DEV. Manual dispatches let the operator
  choose DEV or PROD; either target checks out the latest `main` commit.
- The chosen GitHub Environment supplies that stage's credentials, public URL,
  and remote path. Landing page deployments do not use release tags.
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
  .htaccess
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
3. Add `.github/workflows/deploy-landing.yml`:
   - Trigger relevant pushes to `main` and deploy those to `landing-dev`.
   - Add a manual `workflow_dispatch` choice for `dev` or `prod`, mapping to
     the corresponding GitHub Environment and its environment-scoped settings.
   - Check out `main` for both automatic and manual runs.
   - Cancel superseded DEV deployments, but never cancel an active PROD
     deployment.
4. Validate required configuration, SSH connectivity, and the remote path
   before syncing. Fail on missing values or any SSH/rsync error.
5. Add concise environment setup instructions to the feature documentation.

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
- `LANDING_SSH_PASSWORD`: password for the SSH account. The host must allow
  password-based SSH authentication.

Configure these variables separately on each environment:

- `LANDING_REMOTE_PATH`: existing dedicated absolute landing webroot.
- `LANDING_PUBLIC_URL`: public environment URL shown in GitHub deployments.
- `LANDING_SSH_PORT`: SSH port, with the planned default of `22`.

Use distinct host paths and public URLs for DEV and PROD. Any optional PROD
reviewers or protection rules are configured manually in GitHub; the planned
commands do not configure them.

## SSH and rsync safety

- Use `sshpass` to provide the SSH account password noninteractively without
  printing the secret. Password-based SSH authentication must be enabled on
  the shared host.
- Use `ssh-keyscan` for the configured host and port to populate a temporary
  `known_hosts`, then connect with `StrictHostKeyChecking=yes`. Never disable
  host-key checking globally.
- Require `LANDING_REMOTE_PATH` to be an absolute dedicated directory; reject
  `/`, the remote home directory, and traversal components. Verify it exists
  over SSH before syncing. Do not automatically create a missing directory.
- Sync only `<staging>/` to
  `$LANDING_SSH_USER@$LANDING_SSH_HOST:$LANDING_REMOTE_PATH/` using SSH on the
  configured port and `rsync -az --delete`.
- Include the root Apache `.htaccess` with readable permissions so the host
  can serve `index.html` and does not expose directory listings.
- `--delete` removes stale files only inside that validated remote landing
  webroot; it must never target the home directory or a broader path.

## Acceptance criteria

- A dependency-free export produces a standalone English page at `/` and
  German page at `/de/`, with no unresolved `{{landing.*}}` placeholders.
- The staged artifact contains only the two localized pages, `public/landing`
  supporting files, and the referenced logo/favicon.
- Relevant `main` changes automatically deploy to DEV; unrelated changes do
  not trigger a deployment.
- Manual dispatch offers DEV and PROD, deploys the latest `main` commit, and
  uses the selected environment's URL, credentials, and remote path. No
  release or version tag is required.
- Missing/invalid configuration, SSH authentication/connectivity failure,
  invalid/missing remote directory or rsync failure produces a failed
  workflow.
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
