#!/usr/bin/env bash
# Rebuild the ccms database from scratch (development helper).
# usage: DB_HOST=localhost DB_USER=postgres [DB_NAME=ccms] ./rebuild.sh
set -euo pipefail
cd "$(dirname "$0")"
H="${DB_HOST:-localhost}"; U="${DB_USER:-postgres}"; D="${DB_NAME:-ccms}"
psql -h "$H" -U "$U" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $D WITH (FORCE)" -c "CREATE DATABASE $D"
for f in init/0[1-7]_*.sql; do
  echo "applying $f"; psql -h "$H" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -q -f "$f"
done
