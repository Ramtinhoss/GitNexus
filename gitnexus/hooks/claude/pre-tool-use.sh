#!/bin/bash
# GitNexus PreToolUse hook for Claude Code
# Intercepts Grep/Glob/Bash searches and augments with graph context.
# Receives JSON on stdin with { tool_name, tool_input, cwd, ... }
# Returns JSON with additionalContext for graph-enriched results.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)

# Extract search pattern based on tool type
PATTERN=""

case "$TOOL_NAME" in
  Grep)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty' 2>/dev/null)
    ;;
  Glob)
    # Glob patterns are file paths, not search terms — extract meaningful part
    RAW=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty' 2>/dev/null)
    # Strip glob syntax to get the meaningful name (e.g., "**/*.ts" → skip, "auth*.ts" → "auth")
    PATTERN=$(echo "$RAW" | sed -n 's/.*[*\/]\([a-zA-Z][a-zA-Z0-9_-]*\).*/\1/p')
    ;;
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
    # Only augment grep/rg commands
    if echo "$CMD" | grep -qE '\brg\b|\bgrep\b'; then
      # Extract pattern from rg/grep
      if echo "$CMD" | grep -qE '\brg\b'; then
        PATTERN=$(echo "$CMD" | sed -n "s/.*\brg\s\+\(--[^ ]*\s\+\)*['\"]\\?\([^'\";\| >]*\\).*/\2/p")
      elif echo "$CMD" | grep -qE '\bgrep\b'; then
        PATTERN=$(echo "$CMD" | sed -n "s/.*\bgrep\s\+\(-[^ ]*\s\+\)*['\"]\\?\([^'\";\| >]*\\).*/\2/p")
      fi
    fi
    ;;
  *)
    # Not a search tool — skip
    exit 0
    ;;
esac

# Skip if pattern too short or empty
if [ -z "$PATTERN" ] || [ ${#PATTERN} -lt 3 ]; then
  exit 0
fi

# Check if we're in a GitNexus-indexed repo
dir="${CWD:-$PWD}"
found=false
for i in 1 2 3 4 5; do
  if [ -d "$dir/.gitnexus" ]; then
    found=true
    break
  fi
  parent="$(dirname "$dir")"
  [ "$parent" = "$dir" ] && break
  dir="$parent"
done

if [ "$found" = false ]; then
  exit 0
fi

# Run gitnexus augment — must be fast (<500ms target)
# augment writes to stderr (KuzuDB captures stdout at OS level), so capture stderr and discard stdout
if command -v gitnexus >/dev/null 2>&1; then
  RESULT=$(cd "$CWD" && gitnexus augment "$PATTERN" 2>&1 1>/dev/null)
else
  if [ -n "$GITNEXUS_CLI_SPEC" ]; then
    :
  elif [ -n "$GITNEXUS_CLI_VERSION" ]; then
    GITNEXUS_CLI_SPEC="@veewo/gitnexus@$GITNEXUS_CLI_VERSION"
  elif [ -f "${HOME}/.gitnexus/config.json" ]; then
    GITNEXUS_CLI_SPEC="$(
      node -e 'const fs=require("fs");const os=require("os");const path=require("path");
      try {
        const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
        const parsed=JSON.parse(raw);
        const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
          ? parsed.cliPackageSpec.trim()
          : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
            ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
            : "";
        if (spec) process.stdout.write(spec);
      } catch {}'
    )"
  fi

  [ -z "$GITNEXUS_CLI_SPEC" ] && exit 0
  RESULT=$(cd "$CWD" && npx -y "$GITNEXUS_CLI_SPEC" augment "$PATTERN" 2>&1 1>/dev/null)
fi

if [ -n "$RESULT" ]; then
  ESCAPED=$(echo "$RESULT" | jq -Rs .)
  jq -n --argjson ctx "$ESCAPED" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $ctx
    }
  }'
else
  exit 0
fi
