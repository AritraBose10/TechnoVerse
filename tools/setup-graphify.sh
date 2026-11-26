#!/usr/bin/env bash
# Install graphify (code knowledge graph) on a Mac/Linux machine and build the graph for this repo. The graph (graphify-out/) is git-ignored and rebuilt per machine in about 20 s.
set -euo pipefail
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv tool install graphifyy --python 3.12
cd "$(dirname "$0")/.."
graphify update .
echo "graphify ready. Add  export PATH=\"\$HOME/.local/bin:\$PATH\"  to your shell profile if 'graphify' is not found in a new terminal."
