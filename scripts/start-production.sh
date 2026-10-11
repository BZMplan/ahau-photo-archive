#!/bin/sh
set -eu
umask 077
NODE_BIN=${NODE_BIN:-/usr/bin/node}
"$NODE_BIN" migrations/bootstrap.cjs
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  BETTER_AUTH_SECRET="$("$NODE_BIN" migrations/scripts/read-secret.mjs)"
  export BETTER_AUTH_SECRET
fi
exec "$NODE_BIN" server.js
