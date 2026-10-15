#!/usr/bin/env bash
set -Eeuo pipefail

deploy() {
  local environment="$1"
  local default_branch="$2"
  local branch="${DEPLOY_BRANCH:-$default_branch}"
  local app_dir="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

  if [[ ! -d "$app_dir/.git" ]]; then
    echo "ERROR: APP_DIR is not a Git checkout: $app_dir" >&2
    echo "Set APP_DIR to the Plesk deployment directory." >&2
    exit 1
  fi

  echo "==> Deploying $environment ($branch) in $app_dir"
  git -C "$app_dir" fetch --prune origin "$branch"
  git -C "$app_dir" checkout "$branch"
  git -C "$app_dir" pull --ff-only origin "$branch"

  echo "==> Installing backend dependencies"
  npm ci --prefix "$app_dir/backend" --omit=dev

  echo "==> Installing frontend dependencies and building"
  npm ci --prefix "$app_dir/frontend"
  npm run build --prefix "$app_dir/frontend"

  if [[ "${SKIP_PLESK_RESTART:-0}" == "1" ]]; then
    echo "==> Plesk restart skipped (SKIP_PLESK_RESTART=1)"
    return
  fi

  local restart_file="${PLESK_RESTART_FILE:-$(dirname "$app_dir")/tmp/restart.txt}"
  if [[ ! -d "$(dirname "$restart_file")" ]]; then
    echo "ERROR: Plesk temp directory not found: $(dirname "$restart_file")" >&2
    echo "Set PLESK_RESTART_FILE to the Node.js app's Plesk tmp/restart.txt path." >&2
    exit 1
  fi
  echo "==> Requesting Plesk app restart via $restart_file"
  touch "$restart_file"
  echo "==> $environment deployment completed"
}
