#!/bin/sh
set -e

mc alias set local http://minio:9000 "${S3_ACCESS_KEY_ID}" "${S3_SECRET_ACCESS_KEY}"

if ! mc ls "local/${S3_BUCKET}" >/dev/null 2>&1; then
  mc mb "local/${S3_BUCKET}"
fi

# Strictly private bucket policy: no anonymous public access
mc anonymous set none "local/${S3_BUCKET}"
echo "Private bucket '${S3_BUCKET}' initialized successfully."
