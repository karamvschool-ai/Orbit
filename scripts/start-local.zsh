#!/bin/zsh
set -e
cd "${0:A:h:h}"
if command -v node >/dev/null 2>&1; then
  exec node scripts/dev-server.mjs
fi
orbit_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ -x "$orbit_node" ]]; then
  exec "$orbit_node" scripts/dev-server.mjs
fi
print 'Node.js 22+ is required. Install Node.js, then run pnpm install and pnpm dev.'
exit 1
