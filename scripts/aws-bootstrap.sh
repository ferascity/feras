#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR=/opt/feras
readonly REPOSITORY_URL="${FERAS_REPOSITORY_URL:-https://github.com/ferascity/feras.git}"
readonly BRANCH="${FERAS_BRANCH:-main}"

dnf install -y docker git
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL \
    https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout -f "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$REPOSITORY_URL" "$APP_DIR"
fi

if [ ! -f "$APP_DIR/.env.aws" ]; then
  install -m 600 /dev/null "$APP_DIR/.env.aws"
  cat > "$APP_DIR/.env.aws" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
FERAS_SOLANA_RPC_URL=https://api.devnet.solana.com
FERAS_PROGRAM_ID=3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA
FERAS_DEVNET_USDC_MINT=CwhBMtAs7tAHSabWrW2Dg2hgQ7Ktt7pW86UR35Be9VrU
FERAS_WORKER_POLL_MS=1000
EOF
fi

docker compose \
  --env-file "$APP_DIR/.env.aws" \
  -f "$APP_DIR/docker-compose.yml" \
  -f "$APP_DIR/docker-compose.aws.yml" \
  up -d --build
