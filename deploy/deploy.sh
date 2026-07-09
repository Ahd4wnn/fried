#!/bin/sh
# Hovio VPS deploy: pull latest, rebuild frontend + backend, roll the stack.
# Run on the VPS from the repo root's deploy/ dir: sh deploy/deploy.sh
# Prereqs (one-time): docker, supabase/.env with generated secrets,
# backend/.env with production values.
set -e

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

echo "==> pulling latest"
git pull --ff-only

echo "==> starting Supabase stack"
cd "$REPO_ROOT/supabase"
docker compose up -d

echo "==> waiting for database"
until docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

echo "==> waiting for storage schema (created by the storage service on first boot)"
until docker compose exec -T db psql -U postgres -d postgres -tAc \
  "select 1 from pg_tables where schemaname='storage' and tablename='objects'" 2>/dev/null | grep -q 1; do sleep 3; done

echo "==> applying migrations"
sh apply-migrations.sh

echo "==> ensuring storage buckets"
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "insert into storage.buckets (id, name, public) values ('therapist-credentials','therapist-credentials', false) on conflict (id) do nothing;"

echo "==> building frontend"
cd "$REPO_ROOT"
ANON_KEY=$(grep '^ANON_KEY=' supabase/.env | cut -d= -f2)
docker run --rm \
  -v "$REPO_ROOT/frontend":/app -w /app \
  -e VITE_SUPABASE_URL=https://hovio.org \
  -e VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  -e VITE_API_BASE_URL=https://hovio.org \
  node:22-alpine sh -c "npm ci && npm run build"
mkdir -p deploy/www
rm -rf deploy/www.old
[ -d deploy/www/assets ] && mv deploy/www deploy/www.old && mkdir -p deploy/www
cp -r frontend/dist/. deploy/www/
rm -rf deploy/www.old

echo "==> starting app layer (Caddy + backend)"
cd "$REPO_ROOT/deploy"
docker compose up -d --build
# The caddy admin API is off, so `caddy reload` can't pick up Caddyfile
# changes — restart instead (a couple of seconds of downtime).
docker compose restart caddy >/dev/null

echo "==> done"
docker ps --format '{{.Names}}\t{{.Status}}'
