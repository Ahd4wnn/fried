# Self-hosted Supabase (Hovio)

The official Supabase self-hosted Docker Compose stack (from `supabase/supabase`
`docker/`, upstream docs in `README.upstream.md`), configured for Hovio. The
same folder deploys to the VPS later — only `.env` values change.

All secrets live in `.env` (gitignored). Regenerate with
`sh utils/generate-keys.sh` and `sh utils/add-new-auth-keys.sh`.

## Ports (local)

| Port  | What |
| ----- | ---- |
| 54321 | Kong API gateway — this is `SUPABASE_URL` (REST, Auth, Realtime, Storage) and the Studio dashboard |
| 54322 | Kong HTTPS |
| 54320 | Postgres via Supavisor, session mode (5432 is taken by a native Postgres on this machine) |
| 6543  | Postgres via Supavisor, transaction-mode pooling |

Studio dashboard: <http://localhost:54321> — login with `DASHBOARD_USERNAME` /
`DASHBOARD_PASSWORD` from `.env`.

Direct psql: `psql "postgres://postgres.hovio:<POSTGRES_PASSWORD>@localhost:54320/postgres"`
(username is `postgres.<POOLER_TENANT_ID>` when connecting through Supavisor),
or from inside Docker: `docker compose exec db psql -U postgres`.

## Daily use

```sh
cd supabase
docker compose up -d        # start
docker compose ps           # health
docker compose logs -f auth # logs for one service
docker compose down         # stop (data persists in volumes/db/data)
sh apply-migrations.sh      # apply ../sql/*.sql in order (idempotent)
```

`docker compose down -v` **destroys the database** — don't run it casually.

## Local-dev settings to revisit for the VPS

- `ENABLE_EMAIL_AUTOCONFIRM=true` — signups skip email verification because no
  real SMTP is configured. On the VPS: set real `SMTP_*` values and turn this
  back off.
- `SUPABASE_PUBLIC_URL` / `API_EXTERNAL_URL` / `SITE_URL` point at localhost.
  On the VPS: set to the real domain and put the stack behind TLS
  (`docker-compose.caddy.yml` or `docker-compose.nginx.yml` overrides are
  included — see `.env` `PROXY_DOMAIN`).
- Regenerate **all** secrets on the VPS (`generate-keys.sh`,
  `add-new-auth-keys.sh`) — don't reuse the local ones, and update
  `backend/.env` + `frontend/.env` with the new keys.
- Analytics/logs (Logflare + Vector) are not part of the default compose file;
  add `docker-compose.logs.yml` to `COMPOSE_FILE` in `.env` if wanted.

## One-time setup already done here

- All migrations in `../sql` applied.
- Private storage bucket `therapist-credentials` created (required by
  `08b_storage_policies.sql`; buckets are data, not schema, so it isn't in a
  migration — recreate it on any fresh instance).
