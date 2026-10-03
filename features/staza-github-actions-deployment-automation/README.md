# staza-github-actions-deployment-automation

## Goal

Automate deployment of the existing Staza Docker image to the existing DEV and
PROD VPS Compose projects without redesigning the runtime architecture or
changing server-side secrets and persistent data.

## Scope

- Automatically build and deploy DEV from successful pushes to `main`.
- Build and deploy PROD only for published releases whose tags match
  `staza-X.Y.Z`.
- Reuse the current GHCR Docker build/push implementation; do not duplicate
  image-build logic.
- Use GitHub Environments `app-dev` and `app-prod`, with secrets
  `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` and variables `REMOTE_PATH`,
  `PUBLIC_URL` (optional `SSH_PORT`).
- Keep the existing DEV/PROD Compose projects, separate Postgres databases,
  volumes, env files, app data, external `staza-proxy`, and Caddy setup.

Out of scope: landing-page deployment, VPS provisioning, Docker/Caddy/DNS or
firewall changes, database-backup automation, orchestration platforms,
blue/green or canary deployment, multi-node deployment, and automatic database
rollback.

## Decisions

- Refactor the existing image workflow into a reusable build workflow called by
  distinct DEV and PROD deployment workflows. The deploy jobs depend on
  successful builds of their exact image, avoiding duplicated build logic and
  `workflow_run` tag/ref ambiguity.
- DEV publishes `main` and `sha-${GITHUB_SHA}` but deploys only the immutable
  SHA tag. Its triggers are pushes to `main` and manual dispatch; manual
  dispatch builds the selected workflow ref before deploying.
- PROD is triggered only by a published release. Validate
  `^staza-[0-9]+\.[0-9]+\.[0-9]+$`, remove the `staza-` prefix, and build,
  preflight-pull, and deploy only `ghcr.io/tomislaveric/staza:<version>`.
  Never use `latest` or the `main` image for PROD.
- Preserve server authentication to GHCR; do not add a GHCR PAT to repository
  secrets. Use job-scoped `GITHUB_TOKEN` permissions for runner-side package
  access.
- Transfer only the versioned Compose file. The server `.env` remains
  authoritative; update only `STAZA_IMAGE_TAG` after checking it exists
  exactly once, using an atomic same-directory replacement.
- Use SSH key mode `600` and a temporary `known_hosts` file populated by
  `ssh-keyscan`; require host-key checking and never disable it.
- Validate the exact PROD image before connecting to or modifying the server.
  Validate required server variables and Compose config before applying.
- Deploy in this order: pull image; run
  `node dist/persistence/migrate.js` as a one-off; only if it succeeds, run
  `docker compose up -d`; then verify Docker health and the public URL.
- App startup already applies migrations. The migration runner is ledger-backed
  and wraps pending migrations in a transaction; after the one-off succeeds,
  startup's second invocation sees no pending migration and is a safe no-op.
  Do not roll the database backward or implement speculative rollback.
- DEV concurrency group is `app-dev` with cancellation of older in-progress
  deployments. PROD group is `app-prod` without cancelling an active release.
- Record the previous image tag in logs to support manual rollback. No
  automatic rollback is implemented.

## Environment configuration

DEV values:

- `REMOTE_PATH=/opt/staza/dev`
- `PUBLIC_URL=https://dev.play.staza.world`

PROD values:

- `REMOTE_PATH=/opt/staza/prod`
- `PUBLIC_URL=https://play.staza.world`

The implementation must inspect existing GitHub Environments before creating
them, preserving any existing protection rules. Set the paths and URLs with
`gh variable set`; set each SSH secret with `gh secret set` without exposing
the value in command arguments or logs. Do not create actual secret values as
part of repository implementation.

The app environments were absent during implementation and have now been
created. Only the four non-secret path/URL variables were set; SSH secrets
remain unset pending operator-provided values. The repository's old slug
redirected during the environment `PUT`, so the stable numeric repository
endpoint was used for creation:

```sh
gh api repositories/1390764776/environments --jq '.environments[].name'
gh api --method PUT repositories/1390764776/environments/app-dev --input - <<< '{}'
gh api --method PUT repositories/1390764776/environments/app-prod --input - <<< '{}'

gh variable set REMOTE_PATH --env app-dev --body /opt/staza/dev
gh variable set PUBLIC_URL --env app-dev --body https://dev.play.staza.world
gh secret set SSH_HOST --env app-dev
gh secret set SSH_USER --env app-dev
gh secret set SSH_PRIVATE_KEY --env app-dev

gh variable set REMOTE_PATH --env app-prod --body /opt/staza/prod
gh variable set PUBLIC_URL --env app-prod --body https://play.staza.world
gh secret set SSH_HOST --env app-prod
gh secret set SSH_USER --env app-prod
gh secret set SSH_PRIVATE_KEY --env app-prod
```

## Implementation plan

1. Refactor the current `.github/workflows/deploy-image.yml` into
   `.github/workflows/build-app-image.yml`, reusable via `workflow_call`. Keep
   its Docker build/push logic and accept an optional validated release version
   so DEV produces `main` + SHA tags and PROD produces only the version tag.
2. Add `.github/workflows/deploy-app-dev.yml` with `push` to `main` and
   `workflow_dispatch`; call the reusable image build, then deploy the exact
   SHA tag in `app-dev`.
3. Add `.github/workflows/deploy-app-prod.yml` for published releases. Reject
   invalid tags before building, create the versioned image through the
   reusable build, and require a successful exact-tag pull before any remote
   PROD change.
4. Add a shared deployment helper as needed for SSH/SCP, remote Compose
   validation and sync, required-env checks, safe atomic image-tag update,
   migration, app recreation, bounded health checks, failure logs, and
   previous-tag reporting.
5. Configure distinct deployment concurrency groups and job-level least
   privilege permissions. Do not copy `.env` files or store a GHCR PAT.
6. Update `ops/app/README.md`, `ops/app/dev.env.example`, and
   `ops/app/prod.env.example` to use `ghcr.io/tomislaveric/staza`, document
   SHA tags for DEV and bare semantic version tags for PROD, correct the
   explicit migration order, describe GitHub Environment configuration,
   health checks, and the manual rollback procedure.

## Acceptance criteria

- A successful `main` build is followed by automatic DEV deployment of its
  `sha-<commit>` image; no deployment runs before that image is built.
- DEV deployment updates only `STAZA_IMAGE_TAG` in `/opt/staza/dev/.env`,
  syncs only the DEV Compose file, applies migration before app recreation, and
  verifies Docker health plus the DEV public endpoint.
- Invalid release tags fail. A published valid release builds and deploys the
  exact bare semantic image tag to PROD, and a failed image pull/preflight
  cannot touch PROD.
- PROD updates only `STAZA_IMAGE_TAG` in `/opt/staza/prod/.env`, syncs only the
  PROD Compose file, and validates required variables and Compose config before
  applying.
- SSH host-key checking remains enabled; no secrets are printed; the VPS
  continues using its existing GHCR login and runtime architecture.
- Health-check or migration failure fails the workflow and reports useful logs
  and the previous image tag. No automated DB rollback or volume deletion is
  introduced.
- DEV can be manually dispatched; PROD cannot deploy `main` or `latest`.
- Deployment documentation and examples match the implementation.

## Validation

- Validate workflow syntax and expressions with repository-available tooling
  or a workflow linter if present.
- Test release-tag acceptance/rejection and version extraction, the atomic
  `.env` tag-only update (including duplicate/missing tag failure), Compose
  preflight, and deployment failure handling.
- Run the smallest relevant repository checks and inspect the final diff.
- GitHub Environment state may be inspected/configured only when GitHub CLI/API
  is available; skip creation for existing environments and do not set secret
  values.

## Audit notes

The original image workflow triggers on `main` push and `workflow_dispatch`,
and publishes only `main` and `sha-${GITHUB_SHA}`. It has no release trigger.
The Dockerfile contains the compiled migration entry point; `tsx` is not
installed in the runtime image. Both Compose files use a configurable image/tag
and separate services, networks, and volumes.

The pre-implementation docs and env examples used
`ghcr.io/tomislaveric/locus`, stated that no app deployment workflow existed,
and showed `up -d` before the explicit migration command. Those mismatches are
corrected in the deployment docs and examples.
