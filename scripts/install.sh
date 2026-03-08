#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MNEMO_DIR="$HOME/.mnemo"

echo "=== Mnemo Installer ==="
echo ""

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Install Node.js 18+ from https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi

echo "Node.js $(node -v): OK"

# 2. Check Ollama
if ! command -v ollama &>/dev/null; then
  echo ""
  echo "Warning: Ollama is not installed."
  echo "  Install from: https://ollama.com/download"
  echo "  Mnemo requires Ollama with nomic-embed-text model for semantic search."
  echo ""
  echo "After installing Ollama, run:"
  echo "  ollama pull nomic-embed-text"
  echo ""
else
  # Check if Ollama is running
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo "Ollama: running"
  else
    echo ""
    echo "Warning: Ollama is installed but not running."
    echo "  Start Ollama before using Mnemo."
    echo ""
  fi

  # Check nomic-embed-text model
  if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    echo "nomic-embed-text model: OK"
  else
    echo "Downloading nomic-embed-text model..."
    ollama pull nomic-embed-text
  fi
fi

# 3. Create data directory
mkdir -p "$MNEMO_DIR"
echo "Data directory: $MNEMO_DIR"

# 4. Install dependencies and build
cd "$PROJECT_DIR"
npm install
npm run build

echo "Build: OK"

# 5. Link CLI globally
npm link 2>/dev/null || {
  echo ""
  echo "Note: 'npm link' failed (may need sudo)."
  echo "  You can use the CLI directly: node $PROJECT_DIR/dist/bin/mnemo.js"
  echo "  Or run: sudo npm link"
}

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo ""
echo "  1. Add MCP server to Claude Code:"
echo "     claude mcp add mnemo node $PROJECT_DIR/dist/src/index.js \\"
echo "       -e MNEMO_DATA_DIR=$HOME/.mnemo \\"
echo "       -e OLLAMA_URL=http://localhost:11434"
echo ""
echo "  2. Try the CLI:"
echo "     mnemo learn \"My first lesson\" -t lesson -c \"Details here\""
echo "     mnemo recall \"search query\""
echo "     mnemo stats"
echo ""
