# staza-app-dev-prod-deployment-structure

## Goal

Version the Staza app's DEV and PROD Docker Compose deployments in the
repository so they can be reproduced manually and consumed by future GitHub
Actions without adding deployment workflows in this milestone.

## Scope

- Add separate Compose files and non-secret environment examples for the app
  deployment.
- Document server directory layout, required configuration, proxy targets, and
  manual deployment/lifecycle commands.
- Preserve the already-bootstrapped VPS, Docker/Compose installation, shared
  Caddy, and external `staza-proxy` network.
- Keep the existing root Compose usage for local PostgreSQL distinct from
  server deployment configuration.
- Do not implement landing page deployment changes, app deployment workflows,
  VPS provisioning, Docker installation, firewall/DNS/Caddy setup, backups,
  Kubernetes, Terraform, Ansible, monitoring, scaling, or multi-node
  deployment.

## Decisions

- Add `ops/app/docker-compose.dev.yml`,
  `ops/app/docker-compose.prod.yml`, `ops/app/dev.env.example`,
  `ops/app/prod.env.example`, and `ops/app/README.md`; link the deployment
  guide from the root README.
- Use explicit container names `staza-dev-app`, `staza-dev-postgres`,
  `staza-prod-app`, and `staza-prod-postgres`. The checked-in
  `proxy/Caddyfile` already routes `play.staza.world` to
  `staza-prod-app:3000` and `dev.play.staza.world` to `staza-dev-app:3000`.
- Each deployment has an app and PostgreSQL service. The app joins a private
  app/database network and external `staza-proxy`; PostgreSQL joins only the
  private network. Publish no ports.
- Use isolated named PostgreSQL volumes (`staza-dev-postgres-data`,
  `staza-prod-postgres-data`) and app-data volumes for local jobs and media.
  DEV and PROD do not share database credentials, data, or media.
- Use `restart: unless-stopped`, health checks, and no hard CPU/memory limits.
  Postgres uses `pg_isready`; the app uses Node's built-in HTTP request to the
  existing `/` route because there is no dedicated health endpoint.
- Compose uses `${STAZA_IMAGE}:${STAZA_IMAGE_TAG}`. Examples use
  `ghcr.io/tomislaveric/locus` as the configurable image base; each environment
  chooses its own tag.
- The app starts with `node dist/server.js` and currently runs database
  migrations during startup. Preserve that intentional behavior. Also document
  an explicit one-off migration command using the compiled runtime entry point:
  `docker compose run --rm app node dist/persistence/migrate.js`. The image
  excludes `tsx`, so `npm run migrate` is not available inside it.
- Set `DATA_DIR=/data/jobs` and `MEDIA_DIR=/data/media` on separate
  environment-specific app-data volumes. The app stores uploaded/processed
  activity videos in `MEDIA_DIR`.
- Use `NODE_ENV=production` for the public app instances. Both require
  environment-specific `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, and HTTPS
  `WEBAUTHN_ORIGIN`.
- Keep real server `.env` files outside version control at
  `/opt/staza/dev/.env` and `/opt/staza/prod/.env`. Copy only the selected
  Compose file to each server target as `docker-compose.yml`; never overwrite
  the server-side `.env`.
- Restrict the local root Compose PostgreSQL port to `127.0.0.1` while
  retaining the existing local development workflow.
- Keep the existing, separate landing-page GitHub Actions workflow untouched.

## Implementation plan

1. Add DEV and PROD Compose files with distinct project, container, network,
   Postgres-volume, and app-data-volume names; attach only each app to the
   external `staza-proxy` network.
2. Add DEV and PROD environment examples for image/tag, PostgreSQL settings,
   `DATABASE_URL`, and WebAuthn configuration. Use placeholders, not actual
   credentials.
3. Add deployment documentation describing Compose paths, environment
   variables, hostnames/upstream container targets, target directories,
   network requirements, and isolation boundaries.
4. Document manual pull/up, explicit migration, logs, restart, and stop
   commands for both environments, along with the need for an image the VPS
   can pull from GHCR.
5. Restrict the root local PostgreSQL port to loopback and link the deployment
   guide from the root README.
6. Validate Compose syntax, env-file handling/ignore behavior, naming alignment,
   and local development documentation. Do not add GitHub workflows.

## Acceptance criteria

- DEV and PROD define independent app/PostgreSQL deployments; only each app is
  connected to `staza-proxy`, and Postgres is private with no host port.
- Container names exactly match the checked-in Caddy reverse-proxy targets.
- Database credentials, PostgreSQL volumes, and app/media storage are unique
  per environment.
- Compose uses configurable image and tag variables with no fixed deployment
  tag.
- The examples are tracked, contain no real secrets, and document all required
  server variables; actual `.env` files remain ignored.
- Health checks, restart policy, migration behavior, server file placement, and
  manual lifecycle commands are documented.
- Existing local PostgreSQL commands still work through loopback.
- No app deployment workflow or landing-page behavior is added or changed.

## Validation

- Run the repository's smallest available Compose configuration validation on
  both files; no local `staza-proxy` network or image pull is required for
  static config validation.
- Check that the two Compose definitions, examples, and docs agree on
  container names, network names, volume names, required variables, and host
  paths.
- Verify real `.env` files are ignored while `*.env.example` files are not.
- Verify local Compose still exposes PostgreSQL on `127.0.0.1:5432`, not on
  all host interfaces.
- No application code, Dockerfile, or GitHub Actions workflow changes are
  expected.
