#!/bin/bash
set -euo pipefail

PROJECT_NAME=$(basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")

# Mnemo CLI で関連知識を検索
RESULTS=$(mnemo recall "$PROJECT_NAME" --limit 5 --format json 2>/dev/null || echo "[]")

# 知識の結果をフォーマット
KNOWLEDGE_CONTEXT=""
if [ "$RESULTS" != "[]" ] && [ -n "$RESULTS" ]; then
  KNOWLEDGE_CONTEXT=$(echo "$RESULTS" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    if (!Array.isArray(data) || data.length === 0) { console.log(''); process.exit(0); }
    const lines = data.map(e => '- [' + e.type + '] ' + e.title + ': ' + e.content.slice(0,150));
    console.log('## Mnemo: プロジェクト関連の知識\n' + lines.join('\n'));
  " 2>/dev/null || echo "")
fi

# セッションログ取得
SESSION_CONTEXT=$(mnemo session context -p "$PROJECT_NAME" 2>/dev/null || echo "")

# 両方を結合
COMBINED=""
if [ -n "$KNOWLEDGE_CONTEXT" ]; then
  COMBINED="$KNOWLEDGE_CONTEXT"
fi
if [ -n "$SESSION_CONTEXT" ]; then
  if [ -n "$COMBINED" ]; then
    COMBINED="$COMBINED

$SESSION_CONTEXT"
  else
    COMBINED="$SESSION_CONTEXT"
  fi
fi

if [ -z "$COMBINED" ]; then
  echo '{}'
  exit 0
fi

# JSON エスケープして出力
ESCAPED=$(echo "$COMBINED" | node -e "
  const s = require('fs').readFileSync('/dev/stdin','utf8');
  console.log(JSON.stringify(s));
" 2>/dev/null)

echo "{\"hookSpecificOutput\":{\"additionalContext\":${ESCAPED}}}"
exit 0
