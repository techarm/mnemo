#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MNEMO_DIR="$HOME/.mnemo"

echo "=== Mnemo Installer ==="
echo ""

# 1. Check Ollama
if ! command -v ollama &>/dev/null; then
  echo "Error: Ollama is not installed. Run: brew install ollama"
  exit 1
fi

if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo "Starting Ollama..."
  brew services start ollama
  sleep 3
fi

# 2. Check nomic-embed-text model
if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
  echo "Downloading nomic-embed-text model..."
  ollama pull nomic-embed-text
fi

echo "Ollama + nomic-embed-text: OK"

# 3. Create data directory
mkdir -p "$MNEMO_DIR"

if [ ! -f "$MNEMO_DIR/config.json" ]; then
  cat > "$MNEMO_DIR/config.json" << 'EOF'
{
  "version": "0.1.0",
  "ollamaUrl": "http://localhost:11434",
  "embedModel": "nomic-embed-text",
  "defaultLimit": 10
}
EOF
fi

echo "Data directory: $MNEMO_DIR"

# 4. Install dependencies and build
cd "$PROJECT_DIR"
npm install
npm run build

echo "Build: OK"

# 5. Link CLI globally
npm link 2>/dev/null || true
echo "CLI: mnemo command available"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Usage:"
echo "  CLI:         mnemo learn/recall/stats/export"
echo "  Claude Code: /learn, /recall, /mnemo"
echo ""
echo "Try it:"
echo "  mnemo learn \"My first lesson\" -t lesson -c \"Details here\""
echo "  mnemo recall \"search query\""
echo "  mnemo stats"
