#!/usr/bin/env bash
# HA Carrom — one-shot push to GitHub
# Run this from inside the ha-carrom project folder:
#   chmod +x push-to-github.sh
#   ./push-to-github.sh
set -e

cd "$(dirname "$0")"

REPO_URL="https://github.com/kazishab/HA-Carrom.git"

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

# make sure "origin" points at the right repo (safe to run even if it already does)
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

git add -A
git commit -m "Update app icon/logo, fix coin overlap bug, fix online match-reset bug, fix online Play Again" || echo "Nothing new to commit"

# We always treat the local folder as the source of truth and overwrite
# GitHub with it — no pull/rebase here, since re-running this script from a
# fresh unzip (no .git history) against a repo that already has commits
# causes "unrelated histories" merge conflicts on every file.
git push -u origin main --force

echo "Done — pushed to $REPO_URL"
