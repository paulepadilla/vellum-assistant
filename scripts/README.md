# Scripts

This directory contains highly unstable scripts intended for internal use by Vellum contributors only. They may change or break at any time without notice and should not be relied upon by non-Vellum contributors.

## Local lifecycle helpers

- `vstart.sh` starts the local assistant, starts the web client if needed, and opens the assistant web UI.
- `vstop.sh` stops the web client and sleeps the local assistant.

Local machine wrappers such as `/opt/homebrew/bin/vstart` and `/opt/homebrew/bin/vstop` should delegate to these repo-owned scripts instead of carrying their own lifecycle logic.
