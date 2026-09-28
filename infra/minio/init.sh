#!/bin/sh
# Idempotent bucket setup for local MinIO (spec/setup, spec/security).
set -eu

mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

for bucket in ins-uploads ins-media ins-exports; do
  mc mb --ignore-existing "local/$bucket"
done

# Processed media is public-read (INS-25 narrows this to the public/ prefix).
mc anonymous set download local/ins-media
# Uploads and exports stay private.
mc anonymous set none local/ins-uploads
mc anonymous set none local/ins-exports

# Abandoned uploads are cleaned up after 7 days. `ilm import` replaces the rule set,
# so re-running stays idempotent.
mc ilm import local/ins-uploads < /init/lifecycle-uploads.json

echo "minio-init: buckets ready"
