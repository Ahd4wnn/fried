#!/bin/sh
# One-time VPS bootstrap for Hovio (Ubuntu 24.04). Idempotent.
# Installs Docker, adds swap, configures firewall, clones the repo,
# generates Supabase secrets, and writes production config.
# After this, deploys are just: sh /opt/hovio/deploy/deploy.sh
set -e

REPO_URL=${REPO_URL:-https://github.com/Ahd4wnn/fried.git}
APP_DIR=/opt/hovio
DOMAIN=hovio.org

echo "==> swap (2G)"
if ! swapon --show | grep -q /swapfile; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> docker"
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh

echo "==> firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> clone repo"
if [ ! -d "$APP_DIR/.git" ]; then
    git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/supabase"

echo "==> supabase secrets + production config"
if [ ! -f .env ]; then
    cp .env.example .env
    sh utils/generate-keys.sh --update-env
    sh utils/add-new-auth-keys.sh --update-env

    sed -i \
      -e "s|^KONG_HTTP_PORT=.*|KONG_HTTP_PORT=127.0.0.1:54321|" \
      -e "s|^KONG_HTTPS_PORT=.*|KONG_HTTPS_PORT=127.0.0.1:54322|" \
      -e "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://$DOMAIN|" \
      -e "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN/auth/v1|" \
      -e "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" \
      -e "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://$DOMAIN/**|" \
      -e "s|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|" \
      -e "s|^POOLER_TENANT_ID=.*|POOLER_TENANT_ID=hovio|" \
      -e "s|^STUDIO_DEFAULT_ORGANIZATION=.*|STUDIO_DEFAULT_ORGANIZATION=Hovio|" \
      -e "s|^STUDIO_DEFAULT_PROJECT=.*|STUDIO_DEFAULT_PROJECT=hovio-prod|" \
      .env

    # Bind Postgres/pooler to localhost only (reachable via SSH tunnel).
    cat >> .env <<'EOF'

# Host bindings: keep the database off the public internet.
POSTGRES_HOST_PORT=127.0.0.1:5432
POOLER_HOST_PORT=127.0.0.1:6543
EOF
fi

echo "==> done. Next: create backend/.env, then run: sh $APP_DIR/deploy/deploy.sh"
