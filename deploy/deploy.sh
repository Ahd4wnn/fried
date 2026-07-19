#!/bin/sh
# Hovio VPS deploy: pull latest, rebuild frontend + backend, roll the stack.
# Run on the VPS from the repo root's deploy/ dir: sh deploy/deploy.sh
# Prereqs (one-time): docker, supabase/.env with generated secrets,
# backend/.env with production values.
set -e

# Everything lives inside main() so the shell parses the whole script before
# executing — `git pull` below rewrites this very file mid-run otherwise.
main() {

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
# Public Razorpay key id (not a secret) — the backend already holds it in
# backend/.env; the frontend needs it at build time for Checkout.
RAZORPAY_KEY_ID=$(grep '^RAZORPAY_KEY_ID=' backend/.env | cut -d= -f2)
# Mount the whole repo: vite's publicDir is ../assets (repo root), which must
# be visible inside the build container or images silently vanish from dist.
docker run --rm \
  -v "$REPO_ROOT":/app -w /app/frontend \
  -e VITE_SUPABASE_URL=https://hovio.org \
  -e VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  -e VITE_API_BASE_URL=https://hovio.org \
  -e VITE_RAZORPAY_KEY_ID="$RAZORPAY_KEY_ID" \
  node:22-alpine sh -c "npm ci && npm run build"
# Replace contents in place — deploy/www is bind-mounted into the caddy
# container, so the directory inode must survive (no mv/rm of the dir itself).
mkdir -p deploy/www
find deploy/www -mindepth 1 -delete
cp -r frontend/dist/. deploy/www/

echo "==> starting app layer (Caddy + backend)"
cd "$REPO_ROOT/deploy"
docker compose up -d --build
# The caddy admin API is off, so `caddy reload` can't pick up Caddyfile
# changes — restart instead (a couple of seconds of downtime).
docker compose restart caddy >/dev/null

echo "==> done"
docker ps --format '{{.Names}}\t{{.Status}}'

}
main "$@"
