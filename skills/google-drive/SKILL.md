---
name: google-drive
description: Read and search files in the user's connected Google Drive
compatibility: "Designed for Vellum personal assistants"
metadata:
  emoji: "📁"
  vellum:
    category: "files"
    display-name: "Google Drive"
    user-invocable: true
    activation-hints:
      - "Whenever the user asks about their Google Drive, Drive files, folders, documents, spreadsheets, or presentations"
      - "When the user asks for recent, recently modified, newest, or searched Google Drive files"
      - "For phrases such as 'my Drive', 'find a file', 'recent Drive files', or 'list my documents'"
    avoid-when:
      - "Never use web search to access the user's private Google Drive"
      - "Do not use this skill for local computer files or public web research"
---

This skill reads the user's connected Google Drive. Private Drive data is not
available through `web_search` or `web_fetch`.

## Required Tool Usage

Use the skill tool exposed below.

- Use `skill_execute` with `tool: "google_drive_list"`.
- Pass `max_results` for the requested number of files.
- Pass `query` only when the user asks to search for specific files.
- Results are always ordered by `modifiedTime desc`. The optional `order_by`
  input is accepted for compatibility but is unnecessary.
- Never use the general-purpose `bash`, `web_search`, or `web_fetch` tools for
  Google Drive requests.
- Listing is read-only. Do not claim files were changed, moved, or deleted.
- Listing results are paginated. `max_results` and the number of returned rows
  are never exact match counts when `hasMore` is true. Never count those rows or
  present them as exact bulk-action totals.

## Commands

```bash
# List the five most recently modified non-trashed files
skill_execute: { "tool": "google_drive_list", "input": { "max_results": 5 } }

# Search Drive by name or full-text content
skill_execute: {
  "tool": "google_drive_list",
  "input": { "max_results": 10, "query": "quarterly report" }
}
```

The command returns JSON:

- Success: `{ "ok": true, "data": { "files": [...], "hasMore": true, "countWarning": "..." } }`
- Failure: `{ "ok": false, "error": "..." }`

Each file includes its ID, name, MIME type, modified date, owners, and web link.
The response includes `orderedBy: "modifiedTime desc"`. Present files in the
returned order, which is guaranteed to be newest modification first. Never ask
the user whether to proceed because ordering is already applied internally.

## Connection Recovery

If the command reports that the Drive API is disabled, give the user the
activation link from the error. If authentication is invalid, tell the user
Google needs to be reconnected through Settings > Integrations.
