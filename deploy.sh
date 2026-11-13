#!/usr/bin/env bash
# Builds the frontend, syncs it to the frontend S3 bucket and invalidates the CloudFront cache.
#
# Usage: ./deploy.sh               (build + deploy)
#        SKIP_BUILD=1 ./deploy.sh  (deploy the existing dist/)
#
# DISTRIBUTION_ID defaults to the `frontend_distribution_id` Terraform output of montra-infra
# (override the folder with INFRA_DIR, or set DISTRIBUTION_ID directly).
set -euo pipefail
cd "$(dirname "$0")"

BUCKET=${FRONTEND_BUCKET:-montra-frontend-288761758415}
INFRA_DIR=${INFRA_DIR:-../../montra/montra-infra}

DISTRIBUTION_ID=${DISTRIBUTION_ID:-$(terraform -chdir="$INFRA_DIR" output -raw frontend_distribution_id 2>/dev/null || true)}
[[ -n "$DISTRIBUTION_ID" ]] || { echo "Set DISTRIBUTION_ID (or run terraform apply in $INFRA_DIR first)" >&2; exit 1; }

if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "==> Building"
  npm ci
  npm run build
fi
[[ -f dist/index.html ]] || { echo "dist/index.html not found" >&2; exit 1; }

# Vite puts a content hash in every file name under assets/, so those can be cached forever.
echo "==> Syncing assets to s3://$BUCKET/assets"
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --only-show-errors \
  --cache-control "public,max-age=31536000,immutable"

# index.html and the other fixed-name files (favicon, icons): browsers must re-check them.
echo "==> Syncing the rest to s3://$BUCKET"
aws s3 sync dist "s3://$BUCKET" --delete --only-show-errors --exclude "assets/*" \
  --cache-control "no-cache"

echo "==> Invalidating CloudFront $DISTRIBUTION_ID"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query Invalidation.Id --output text

echo "==> Done: $(terraform -chdir="$INFRA_DIR" output -raw frontend_url 2>/dev/null || echo "see frontend_url in terraform output")"
