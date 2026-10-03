# Staza app Docker deployment

This guide covers only the app and its PostgreSQL database. The landing page
deployment is separate. DEV and PROD are separate Compose projects and share
only the existing reverse-proxy network and configurable image base.

## Repository and server files

Versioned Compose files and non-secret environment templates:

- `ops/app/docker-compose.dev.yml`
- `ops/app/docker-compose.prod.yml`
- `ops/app/dev.env.example`
- `ops/app/prod.env.example`

Copy the matching Compose file to the VPS as
`/opt/staza/dev/docker-compose.yml` or `/opt/staza/prod/docker-compose.yml`.
Create the real environment files separately at `/opt/staza/dev/.env` and
`/opt/staza/prod/.env`. Updating the Compose file must not overwrite either
server-side `.env`.

Before starting either project, the shared external Docker network
`staza-proxy` must exist. Only the app joins that network; PostgreSQL is on its
environment's private internal network and publishes no host port.

## Caddy and service names

The checked-in `proxy/Caddyfile` expects these Docker upstreams:

| Hostname | Upstream |
| --- | --- |
| `https://play.staza.world` | `staza-prod-app:3000` |
| `https://dev.play.staza.world` | `staza-dev-app:3000` |

The VPS Caddy instance must be attached to `staza-proxy` and use equivalent
targets. The Compose app container names and network aliases match these
upstreams.

## Environment configuration

Start with the corresponding `*.env.example` and use unique values for each
environment. Required variables:

| Variable | Purpose |
| --- | --- |
| `STAZA_IMAGE` | Image name, for example `ghcr.io/tomislaveric/locus`. |
| `STAZA_IMAGE_TAG` | Independently selected DEV or PROD image tag. |
| `POSTGRES_DB` | Environment-specific database name. |
| `POSTGRES_USER` | Environment-specific database user. |
| `POSTGRES_PASSWORD` | Environment-specific database password. |
| `DATABASE_URL` | App connection URL; use host `postgres`, port `5432`, and URL-encode reserved password characters. |
| `WEBAUTHN_RP_ID` | Public hostname for the environment. |
| `WEBAUTHN_RP_NAME` | WebAuthn relying-party display name. |
| `WEBAUTHN_ORIGIN` | Exact HTTPS origin for the environment. |

Compose sets `NODE_ENV=production`, `PORT=3000`, `DATA_DIR=/data/jobs`, and
`MEDIA_DIR=/data/media`. The app container uses an environment-specific named
volume for `/data`; PostgreSQL uses a different named volume for its data
directory. Never reuse database credentials or `DATABASE_URL` between DEV and
PROD.

The app image must be available to the VPS. Authenticate Docker to GHCR on the
host if the package is private. Future automation may choose tags independently
(for example, a development build tag and a `staza-X.Y.Z` release tag); no
deployment workflow is included here.

## Manual commands

Run each command for only one environment at a time. For DEV:

```sh
docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml pull

docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml up -d

docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml run --rm app node dist/persistence/migrate.js

docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml logs -f app postgres

docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml restart app

docker compose --env-file /opt/staza/dev/.env \
  -f /opt/staza/dev/docker-compose.yml stop
```

For PROD, use the same commands with `/opt/staza/prod/.env` and
`/opt/staza/prod/docker-compose.yml`. `up -d` starts or recreates services;
`stop` stops that environment and `restart app` restarts only its app. `down`
also stops and removes that project's containers and networks but leaves
named volumes. Do not use `down -v` unless intentionally deleting that
environment's persistent data.

The current app startup already applies pending database migrations. The
one-off compiled command above is available for an explicit migration step;
the runtime image does not include `tsx`, so `npm run migrate` is not the
container command.

## Isolation and health

DEV and PROD have separate Compose projects, private app/database networks,
PostgreSQL containers, credentials, PostgreSQL volumes, and app-data volumes
for jobs and uploaded/processed media. They share only the external
`staza-proxy` network and may use the same image with different tags.

PostgreSQL health uses `pg_isready`; app health checks the existing `/` route
using Node's built-in HTTP client. No new health endpoint is introduced.
Services use `restart: unless-stopped`; no CPU or memory limits are set.
