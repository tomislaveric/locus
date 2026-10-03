# Landing page deployment

The public Staza landing page is deployed on its own, independent of the
application. Two workflows render the English and German pages with a
dependency-free static export (`scripts/export-landing.mjs`) and sync the
staged artifact over SSH with `scripts/deploy-landing.sh`.

- `.github/workflows/deploy-landing-dev.yml` — deploys on pushes to `main` that
  touch `public/landing/**`, `src/landing/**`, or `scripts/export-landing.mjs`.
  Uses the `landing-dev` environment and the `landing-dev` concurrency group
  with `cancel-in-progress: true`.
- `.github/workflows/deploy-landing-prod.yml` — deploys on published GitHub
  Releases whose tag matches `staza-MAJOR.MINOR.PATCH` and whose commit is
  reachable from `main`. Uses the `landing-prod` environment and the
  `landing-prod` concurrency group with `cancel-in-progress: false`.

No application, VPS, database, container, or backend service is deployed, and
the workflows never run `npm install`, application compilation, or the test
suite.

## One-time environment setup

Create the two GitHub Environments and set the default SSH port. Run these only
after implementation approval; do not set secrets with the CLI.

```bash
gh api --method PUT repos/tomislaveric/locus/environments/landing-dev --input - <<< '{}'
gh api --method PUT repos/tomislaveric/locus/environments/landing-prod --input - <<< '{}'
gh variable set LANDING_SSH_PORT --env landing-dev --body 22
gh variable set LANDING_SSH_PORT --env landing-prod --body 22
```

Configure the remaining values **separately on each environment** in the GitHub
UI, using distinct host paths and public URLs for DEV and PROD.

Secrets (Settings → Environments → *env* → Environment secrets):

| Secret | Description |
| --- | --- |
| `LANDING_SSH_HOST` | Shared-host SSH hostname. |
| `LANDING_SSH_USER` | SSH account username. |
| `LANDING_SSH_PASSWORD` | Password for the SSH account. |

Variables (Settings → Environments → *env* → Environment variables):

| Variable | Description |
| --- | --- |
| `LANDING_REMOTE_PATH` | Existing dedicated absolute landing webroot. |
| `LANDING_PUBLIC_URL` | Public environment URL shown in GitHub deployments. Must be a full absolute URL including the scheme, e.g. `https://staza.world/` (PROD) or `https://dev.staza.world/` (DEV). Without `https://` GitHub will not render a clickable deployment link. |
| `LANDING_SSH_PORT` | SSH port (default `22`). |

Optional PROD reviewers or protection rules are configured manually in the
GitHub UI.

## Safe remote deployment

`scripts/deploy-landing.sh` enforces the following before any file transfer:

- Uses `sshpass` to provide the password noninteractively without printing it.
  SSH password authentication must be enabled by the host.
- Pins the host key with `ssh-keyscan` into a temporary `known_hosts` and
  connects with `StrictHostKeyChecking=yes`; host-key checking is never
  disabled globally.
- Requires `LANDING_REMOTE_PATH` to be an absolute, dedicated directory and
  rejects `/`, the home directory, and traversal components. The directory must
  already exist on the host — it is never created automatically.
- Syncs only the staged artifact with `rsync -az --delete` scoped to the
  validated webroot.

`rsync --delete` is destructive within the configured webroot. There is no
automated rollback; recovery from an interrupted sync relies on a host-side
backup.

## Local export check

```bash
node scripts/export-landing.mjs /tmp/landing-out
```

The command stages the artifact and fails on incomplete localization,
unresolved `{{landing.*}}` placeholders, or missing referenced assets. The
staged tree contains only the two localized pages, the `public/landing`
supporting files, and the referenced `favicon.svg` and `logo-full.svg`.
