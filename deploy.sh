#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf "Deploying backend...\n"
(
  cd "$ROOT_DIR/indie-web-starter-backend"
  npm run deploy
)

printf "Deploying frontend...\n"
(
  cd "$ROOT_DIR/indie-web-starter-frontend"
  npm run deploy
)

printf "Done: backend and frontend deployed.\n"
