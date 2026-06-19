#!/bin/zsh

set -u

export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: vstop [assistant-name-or-id]"
  echo
  echo "Stops the Vellum web client on port 3000 and sleeps the local assistant."
  echo "Default assistant: vellum-eager-deer-5ngf41"
  exit 0
fi

ASSISTANT_ID="${1:-vellum-eager-deer-5ngf41}"
WEB_PORT="${VELLUM_WEB_PORT:-3000}"

echo "Stopping Vellum web client for ${ASSISTANT_ID}..."

pkill -f "vellum client ${ASSISTANT_ID} --interface web" >/dev/null 2>&1 || true
pkill -f "vellum client .*--interface web" >/dev/null 2>&1 || true

if /usr/sbin/lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  for pid in $(/usr/sbin/lsof -tiTCP:"${WEB_PORT}" -sTCP:LISTEN 2>/dev/null); do
    command_line="$(/bin/ps -p "${pid}" -o command= 2>/dev/null || true)"
    case "${command_line}" in
      *"vellum client"*|*"vite"*|*"apps/web"*|*"Vellum AI"*)
        echo "Stopping web process ${pid} on port ${WEB_PORT}"
        /bin/kill "${pid}" >/dev/null 2>&1 || true
        ;;
      *)
        echo "Leaving unrelated process ${pid} on port ${WEB_PORT}: ${command_line}"
        ;;
    esac
  done
fi

echo "Stopping Vellum assistant ${ASSISTANT_ID}..."
vellum sleep "${ASSISTANT_ID}" --force || true

if /usr/sbin/lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${WEB_PORT} is still in use. Run: lsof -nP -iTCP:${WEB_PORT} -sTCP:LISTEN"
else
  echo "Vellum web client stopped."
fi

echo "Done."
