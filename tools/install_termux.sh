#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Installing Python..."
  pkg install -y python
fi

python3 -m pip install --upgrade pip >/dev/null 2>&1
python3 -m pip install httpx >/dev/null 2>&1

mkdir -p "$HOME/.local/bin"
ln -sf "$REPO_ROOT/tools/maya_pos_terminal.py" "$HOME/.local/bin/maya-pos"
chmod +x "$HOME/.local/bin/maya-pos"

cat <<EOF
✅ Maya POS terminal installed.

Next steps:
  1. Export your Maya Manager key:
     export MAYA_SECRET_KEY="your-secret-key"
     export MAYA_MODE="sandbox"   # or live
  2. Run the helper:
     maya-pos --amount 250 --description "Coffee"

If your shell does not see ~/.local/bin, add this to ~/.bashrc:
  export PATH="\$HOME/.local/bin:\$PATH"
EOF
