#!/bin/bash
set -euo pipefail

PROJECT_NAME=$(basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")

# Mnemo CLI で関連知識を検索
RESULTS=$(mnemo recall "$PROJECT_NAME" --limit 5 --format json 2>/dev/null || echo "[]")

# 結果がなければ空で返す
if [ "$RESULTS" = "[]" ] || [ -z "$RESULTS" ]; then
  echo '{}'
  exit 0
fi

# 結果をフォーマットして注入
CONTEXT=$(echo "$RESULTS" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  if (!Array.isArray(data) || data.length === 0) { console.log(''); process.exit(0); }
  const lines = data.map(e => '- [' + e.type + '] ' + e.title + ': ' + e.content.slice(0,150));
  console.log('## Mnemo: プロジェクト関連の知識\n' + lines.join('\n'));
" 2>/dev/null || echo "")

if [ -z "$CONTEXT" ]; then
  echo '{}'
  exit 0
fi

# JSON エスケープして出力
ESCAPED=$(echo "$CONTEXT" | node -e "
  const s = require('fs').readFileSync('/dev/stdin','utf8');
  console.log(JSON.stringify(s));
" 2>/dev/null)

echo "{\"hookSpecificOutput\":{\"additionalContext\":${ESCAPED}}}"
exit 0
