#!/bin/bash
# GitNexus beforeShellExecution hook for Cursor
# Receives JSON on stdin with { command, cwd, timeout }
# Returns JSON on stdout with { permission, agent_message }
#
# Extracts search pattern from grep/rg commands, runs gitnexus augment,
# and injects the enriched context via agent_message.

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | jq -r '.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Skip non-search commands
case "$COMMAND" in
  cd\ *|npm\ *|yarn\ *|pnpm\ *|git\ commit*|git\ push*|git\ pull*|mkdir\ *|rm\ *|cp\ *|mv\ *|echo\ *|cat\ *)
    echo '{"permission":"allow"}'
    exit 0
    ;;
esac

# Extract search pattern from rg/grep commands
PATTERN=""
if echo "$COMMAND" | grep -qE '\brg\b'; then
  PATTERN=$(echo "$COMMAND" | sed -n "s/.*\brg\s\+\(--[^ ]*\s\+\)*['\"]\\?\([^'\";\| >]*\\).*/\2/p")
elif echo "$COMMAND" | grep -qE '\bgrep\b'; then
  PATTERN=$(echo "$COMMAND" | sed -n "s/.*\bgrep\s\+\(-[^ ]*\s\+\)*['\"]\\?\([^'\";\| >]*\\).*/\2/p")
fi

if [ -z "$PATTERN" ] || [ ${#PATTERN} -lt 3 ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Run gitnexus augment
if command -v gitnexus >/dev/null 2>&1; then
  RESULT=$(gitnexus augment "$PATTERN" 2>/dev/null)
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

  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo '{"permission":"allow"}'
    exit 0
  fi

  RESULT=$(npx -y "$GITNEXUS_CLI_SPEC" augment "$PATTERN" 2>/dev/null)
fi

if [ -n "$RESULT" ]; then
  # Escape for JSON
  ESCAPED=$(echo "$RESULT" | jq -Rs .)
  echo "{\"permission\":\"allow\",\"agent_message\":$ESCAPED}"
else
  echo '{"permission":"allow"}'
fi

exit 0
