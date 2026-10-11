#!/usr/bin/env bash
# Production deploy: create .env.production on first run, then build and start the stack.
# Usage: scripts/deploy.sh [+965XXXXXXXX]   (phone required only on the first run)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.production

if [[ ! -f "$ENV_FILE" ]]; then
  phone="${1:-}"
  if [[ ! "$phone" =~ ^\+965[0-9]{8}$ ]]; then
    echo "First run: pass the administrator phone, e.g. scripts/deploy.sh +96512345678" >&2
    exit 1
  fi
  db_password=$(openssl rand -hex 24)
  admin_password=$(openssl rand -base64 18 | tr -d '/+=')
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
API_ENV_FILE=$ENV_FILE
APP_ORIGIN=https://just4kids.capellaegy.com
ADMIN_PHONE=$phone
ADMIN_PASSWORD=$admin_password
AUTH_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$db_password
DB_ROOT_PASSWORD=$(openssl rand -hex 24)
DATABASE_URL=mysql://just4kids:$db_password@db:3306/just4kids
DOCKER_DATABASE_URL=mysql://just4kids:$db_password@db:3306/just4kids
ENV
  echo "Created $ENV_FILE"
  echo "Administrator login: $phone / $admin_password  (shown once; also stored in $ENV_FILE)"
fi

docker compose --env-file "$ENV_FILE" up --detach --build
docker compose --env-file "$ENV_FILE" ps
