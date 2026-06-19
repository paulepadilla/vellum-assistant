---
name: google-contacts
description: Read and list contacts from the user's connected Google account
compatibility: "Designed for Vellum personal assistants"
metadata:
  emoji: "👤"
  vellum:
    category: "productivity"
    display-name: "Google Contacts"
    user-invocable: true
    activation-hints:
      - "Whenever the user asks about their Google contacts, address book, contact names, or contact email addresses"
      - "For phrases such as 'my contacts', 'list contacts', 'find a contact', or 'contact email'"
    avoid-when:
      - "Never use web search to access the user's private Google contacts"
      - "Do not use this skill to create, edit, merge, or delete contacts"
---

This skill reads contacts from the user's connected Google account. Private
contact data is not available through `web_search` or `web_fetch`.

## Required Tool Usage

Use `skill_execute` with `tool: "google_contacts_list"`.

- Pass `max_results` for the requested number of contacts.
- Pass `query` only when the user asks to find a specific contact.
- Never use `bash`, `web_search`, or `web_fetch` for Google Contacts requests.
- This tool is read-only. Do not claim contacts were created, changed, or
  deleted.
- Search and listing results are paginated. `max_results` and the number of
  returned rows are never exact match counts when `hasMore` is true. Never
  count those rows or present them as exact bulk-action totals.

## Commands

```bash
# List the five most recently modified contacts
skill_execute: {
  "tool": "google_contacts_list",
  "input": { "max_results": 5 }
}

# Search contacts by name or email
skill_execute: {
  "tool": "google_contacts_list",
  "input": { "max_results": 10, "query": "Alice" }
}
```

The command returns JSON with `contacts`, `hasMore`, and `countWarning` fields.
Each contact includes its resource name, display name, and email addresses.

## Connection Recovery

If the People API is disabled, give the user the activation link from the
error. If authentication is invalid, tell the user to reconnect Google through
Settings > Integrations.
