#!/bin/bash
set -euo pipefail

INPUT=$(cat)

# tool_response からエラーを検出
HAS_ERROR=$(echo "$INPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const output = JSON.stringify(data.tool_response || data.tool_output || '').toLowerCase();
  const patterns = ['error', 'failed', 'not found', 'exception', 'permission denied', 'cannot find', 'no such file'];
  const found = patterns.some(p => output.includes(p));
  console.log(found ? 'true' : 'false');
" 2>/dev/null || echo "false")

if [ "$HAS_ERROR" = "true" ]; then
  echo '{"hookSpecificOutput":{"additionalContext":"[Mnemo] エラーを検出しました。解決策が見つかったら /learn で記録すると、次回同じ問題に遭遇した時に役立ちます。"}}'
else
  echo '{}'
fi

exit 0
