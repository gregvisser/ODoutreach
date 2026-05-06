#!/usr/bin/env bash
set -euo pipefail

echo "== ODoutreach Cloud Agent update =="
echo "Node: $(node --version || true)"
echo "npm: $(npm --version || true)"

if [ -f package-lock.json ]; then
  echo "Installing npm dependencies with npm ci..."
  npm ci
else
  echo "package-lock.json not found; using npm install..."
  npm install
fi

echo "Generating Prisma client..."
npx prisma generate

echo "Cloud Agent update complete."
