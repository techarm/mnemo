#!/bin/bash
set -euo pipefail

INPUT=$(cat)

# tool_input と tool_response を解析
RESULT=$(echo "$INPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const input = JSON.stringify(data.tool_input || '').toLowerCase();
  const output = JSON.stringify(data.tool_response || data.tool_output || '').toLowerCase();

  // git commit 検出
  if (input.includes('git commit') || input.includes('git add')) {
    if (output.includes('create mode') || output.includes('files changed') || output.match(/\\[\\w+\\s+[a-f0-9]+\\]/)) {
      console.log('commit');
      process.exit(0);
    }
  }

  // エラー検出
  const patterns = ['error', 'failed', 'not found', 'exception', 'permission denied', 'cannot find', 'no such file'];
  if (patterns.some(p => output.includes(p))) {
    console.log('error');
    process.exit(0);
  }

  console.log('none');
" 2>/dev/null || echo "none")

case "$RESULT" in
  commit)
    echo '{"hookSpecificOutput":{"additionalContext":"[Mnemo] コミットを検出しました。完了したタスクがあれば mnemo_task(action: done) で完了マークしてください。"}}'
    ;;
  error)
    echo '{"hookSpecificOutput":{"additionalContext":"[Mnemo] エラーを検出しました。解決策が見つかったら /learn で記録すると、次回同じ問題に遭遇した時に役立ちます。"}}'
    ;;
  *)
    echo '{}'
    ;;
esac

exit 0
