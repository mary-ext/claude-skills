#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Split arguments into prompt and optional file paths (after --)
PROMPT=""
FILES=()
SEEN_SEPARATOR=false

for arg in "$@"; do
  if [[ "$arg" == "--" ]]; then
    SEEN_SEPARATOR=true
    continue
  fi
  if $SEEN_SEPARATOR; then
    FILES+=("$arg")
  else
    PROMPT="${PROMPT:+$PROMPT }$arg"
  fi
done

if [ -z "$PROMPT" ]; then
  echo "Usage: review.sh <question> [-- file1 file2 ...]"
  exit 1
fi

# Build the full prompt: question + file contents
FULL_PROMPT="$PROMPT"

if [ ${#FILES[@]} -gt 0 ]; then
  FULL_PROMPT="${FULL_PROMPT}

---
## Relevant paths
"
  for f in "${FILES[@]}"; do
    FULL_PROMPT="${FULL_PROMPT}
- \`${f}\`"
  done
  FULL_PROMPT="${FULL_PROMPT}
"
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/codex-opinion-XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT
OUTFILE="$TMP_DIR/opinion.md"
ERRFILE="$TMP_DIR/err.log"

WORKDIR=$(pwd)

rc=0
echo "$FULL_PROMPT" | mise exec codex -- codex exec \
  --full-auto \
  --sandbox read-only \
  --skip-git-repo-check \
  --ephemeral \
  -c "model_instructions_file=\"${SCRIPT_DIR}/review-system-prompt.md\"" \
  -c 'model_reasoning_effort="xhigh"' \
  -c 'web_search="live"' \
  -o "$OUTFILE" \
  - >/dev/null 2>"$ERRFILE" || rc=$?

# Work around Codex CLI ≥0.118 sandbox bug that leaves an empty .codex file
# in the project root (openai/codex#16088). -f excludes directories.
if [ -f "$WORKDIR/.codex" ] && [ ! -s "$WORKDIR/.codex" ]; then
  rm -f "$WORKDIR/.codex"
fi

if [ $rc -ne 0 ]; then
  echo "Error: codex exec failed (exit $rc)" >&2
  cat "$ERRFILE" >&2
  exit $rc
fi

cat "$OUTFILE"
