#!/bin/zsh

set -u

export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: vstart [assistant-name-or-id]"
  echo
  echo "Starts the local Vellum assistant, starts the web client if needed,"
  echo "and opens http://localhost:3000/assistant/."
  echo "Default assistant: vellum-eager-deer-5ngf41"
  exit 0
fi

ASSISTANT_ID="${1:-vellum-eager-deer-5ngf41}"
WEB_PORT="${VELLUM_WEB_PORT:-3000}"
WEB_URL="${VELLUM_WEB_URL:-http://localhost:${WEB_PORT}/assistant/}"
WEB_LOG="${VELLUM_WEB_LOG:-$HOME/.vellum-web.log}"

vellum wake "${ASSISTANT_ID}" --watch || exit 1

if ! /usr/sbin/lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup vellum client "${ASSISTANT_ID}" --interface web >"${WEB_LOG}" 2>&1 &
fi

for _ in {1..60}; do
  if /usr/sbin/lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    open "${WEB_URL}"
    exit 0
  fi
  sleep 1
done

echo "Vellum did not become ready. See ${WEB_LOG}"
exit 1
