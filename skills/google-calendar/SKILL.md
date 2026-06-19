---
name: google-calendar
description: View, create, and manage Google Calendar events and check availability
compatibility: "Designed for Vellum personal assistants"
metadata:
  icon: assets/icon.svg
  emoji: "📅"
  vellum:
    category: "calendar"
    display-name: "Google Calendar"
    user-invocable: true
    activation-hints:
      - "Whenever the user asks about their calendar, schedule, availability, meetings, appointments, or events"
      - "When the user asks for upcoming, next, future, today's, or tomorrow's calendar events"
      - "When the user asks to create, update, RSVP to, remove, or end a Google Calendar event or recurring series"
      - "For phrases such as 'my calendar', 'my next events', 'what is on my schedule', or 'am I free'"
    avoid-when:
      - "Never use web search to read or manage the user's personal calendar"
      - "Do not use this skill for public event research that is not stored in the user's Google Calendar"
---

## Script Reference

All operations use a single CLI script that returns JSON. Commands run from
the assistant workspace root, so always use the workspace-relative path shown
below:

For personal calendar requests, load this skill and use its CLI. Never use
`web_search` or `web_fetch`; personal Google Calendar data is not obtained
from the public web.

- **Success**: `{ "ok": true, "data": ... }`
- **Failure**: `{ "ok": false, "error": "..." }`

| Script            | Subcommand     | Description                                                    |
| ----------------- | -------------- | -------------------------------------------------------------- |
| `scripts/gcal.ts` | `list`         | List events within a date range                                |
| `scripts/gcal.ts` | `get`          | Get full details of a specific event                           |
| `scripts/gcal.ts` | `create`       | Create a new event (**requires user confirmation**)            |
| `scripts/gcal.ts` | `delete`       | Delete an event (**requires user confirmation**)               |
| `scripts/gcal.ts` | `end-series`   | Remove future occurrences while preserving past occurrences   |
| `scripts/gcal.ts` | `availability` | Check free/busy times across calendars                         |
| `scripts/gcal.ts` | `rsvp`         | Respond to an event invitation (accepted, declined, tentative) |

## Usage Examples

```bash
# List events in a date range
bun skills/google-calendar/scripts/gcal.ts list --time-min "2024-01-15T00:00:00Z" --time-max "2024-01-22T00:00:00Z"

# Get full details of a specific event
bun skills/google-calendar/scripts/gcal.ts get --event-id "abc123"

# Create a new event (gates on assistant ui confirm)
bun skills/google-calendar/scripts/gcal.ts create --summary "Team Meeting" --start "2024-01-15T09:00:00-05:00" --end "2024-01-15T10:00:00-05:00" --timezone "America/New_York"

# Delete one event or recurring occurrence (gates on assistant ui confirm)
bun skills/google-calendar/scripts/gcal.ts delete --event-id "abc123"

# Delete several explicitly listed events in one confirmed operation
bun skills/google-calendar/scripts/gcal.ts delete --event-id "abc123" --event-id "def456"

# End an open-ended recurring series at a cutoff (gates on confirmation)
bun skills/google-calendar/scripts/gcal.ts end-series --event-id "recurring-master-id" --cutoff "2026-06-08T14:00:00-07:00"

# Check availability for a day
bun skills/google-calendar/scripts/gcal.ts availability --time-min "2024-01-15T00:00:00Z" --time-max "2024-01-15T23:59:59Z"

# RSVP to an event invitation
bun skills/google-calendar/scripts/gcal.ts rsvp --event-id "abc123" --response accepted
```

## Connection Setup

1. **Check connection health first.** Run `assistant oauth status google`. This checks whether the user's Google account is connected and the token is valid. Google Calendar shares the same OAuth connection as Gmail — if the user already connected Gmail, calendar access is included.
2. **If no connection is found or the status check fails:** Load the `vellum-oauth-integrations` skill. The skill will evaluate whether managed or your-own mode is appropriate and guide the user accordingly.

## Scheduling Playbook

When the user wants to schedule something:

1. **Always check availability first** before proposing times. Use `bun skills/google-calendar/scripts/gcal.ts availability` to find free slots.
2. Propose 2-3 available time options to the user.
3. Once the user picks a time, create the event with `bun skills/google-calendar/scripts/gcal.ts create`.
4. If adding other attendees, mention that they'll receive an invitation email.

## Date & Time Handling

- Use ISO 8601 format for dates and times (e.g., `2024-01-15T09:00:00-05:00`).
- For all-day events, use date-only format (e.g., `2024-01-15`).
- Always ask the user for their timezone if it's not already known from context or their profile.
- When listing events, display times in the user's local timezone.
- The `list` command returns events in chronological order by default. For
  "next N events" requests, pass `--max-results N` and do not substitute a
  title search or group recurring annual events manually.
- Build every list command from the latest user message only. Never carry a
  previous `--query`, date range, title filter, or deletion target into a new
  request unless the latest message explicitly repeats it.
- Before answering, verify that the result addresses the latest request. For
  example, a "next 5 events" request must return up to five chronological
  events and must not answer an earlier title-search question.

## Confidence & Safety

Create, delete, and RSVP are **medium-risk** operations:

- **Create**: The `create` subcommand gates on `assistant ui confirm` — it presents a confirmation dialog to the user and only proceeds if approved. Pass `--skip-confirm` when the user has already given explicit confirmation in the conversation.
- **Delete**: First list the matching events and explain exactly what will be removed. Pass every confirmed event as a repeated `--event-id` argument in one `delete` command. The command gates on one `assistant ui confirm` and reports `deletedCount`; never claim success unless that count matches the requested events. Pass `--skip-confirm` only when the user explicitly confirmed those exact listed events in the conversation. Deleting a recurring occurrence removes only that occurrence.
- **End recurring series**: When the user asks to remove all future occurrences of an open-ended recurring event, use the `recurringEventId` from a listed occurrence as the `end-series --event-id` value and pass the current time or requested boundary as `--cutoff`. This preserves past occurrences and removes the rest of the series. Never delete the recurring master event when the user asked to preserve calendar history.
- **RSVP**: The `rsvp` subcommand gates on `assistant ui confirm` — it presents a confirmation dialog showing the event, current status, and new response. Pass `--skip-confirm` when the user has already given explicit confirmation in the conversation.

Confidence scores for medium-risk operations:

- **0.9-1.0**: User explicitly requested this exact action
- **0.7-0.8**: Action is strongly implied by context
- **0.5-0.6**: Reasonable inference but some ambiguity
- **Below 0.5**: Ask the user to confirm before proceeding

## Error Recovery

When a calendar script fails with a token or authorization error:

1. **Try to reconnect silently.** Run `assistant oauth ping google`. This often resolves expired tokens automatically.
2. **If reconnection fails, go straight to setup.** Don't present options, ask which route the user prefers, or explain what went wrong technically. Just tell the user briefly (e.g., "Google Calendar needs to be reconnected - let me set that up") and immediately load the `vellum-oauth-integrations` skill. The user came to you to get something done, not to troubleshoot - make it seamless.
3. **Never try alternative approaches.** Don't use curl, browser automation, or any workaround. If the scripts can't do it, the reconnection flow is the answer.
4. **Never expose error details.** The user doesn't need to see error messages about tokens, OAuth, or API failures. Translate errors into plain language.
