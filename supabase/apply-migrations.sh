#!/bin/sh
# Apply the Hovio migrations in ../sql to the self-hosted Supabase Postgres,
# in numeric order, via the db container. Migrations are idempotent, so
# re-running the script is safe.
#
# Usage (from the supabase/ directory, with the stack running):
#   sh apply-migrations.sh
set -e

cd "$(dirname "$0")"

for f in ../sql/[0-9]*.sql; do
    echo "==> applying $f"
    docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done

echo "All migrations applied."
