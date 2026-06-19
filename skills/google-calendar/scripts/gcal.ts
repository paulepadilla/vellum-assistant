#!/usr/bin/env bun

/**
 * Google Calendar CLI script.
 * Subcommands: list, get, create, delete, end-series, availability, rsvp
 */

import {
  parseArgs,
  printError,
  ok,
  requireArg,
  optionalArg,
  parseCsv,
} from "./lib/common.js";
import {
  listEvents,
  getEvent,
  createEvent,
  deleteEvent,
  patchEvent,
  freeBusy,
  type CalendarEvent,
  type EventAttendee,
} from "./lib/gcal-client.js";

// ---------------------------------------------------------------------------
// UI confirmation helper
// ---------------------------------------------------------------------------

/**
 * Request user confirmation via `assistant ui confirm`.
 * Blocks until the user approves, denies, or the request times out.
 */
async function requestConfirmation(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
}): Promise<boolean> {
  const args = [
    "assistant",
    "ui",
    "confirm",
    "--title",
    opts.title,
    "--message",
    opts.message,
    "--confirm-label",
    opts.confirmLabel ?? "Confirm",
    "--json",
  ];

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  try {
    const result = JSON.parse(stdout);
    return result.ok === true && result.confirmed === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function list(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const timeMin = optionalArg(args, "time-min") ?? new Date().toISOString();
  const timeMax = optionalArg(args, "time-max");
  const maxResults = Math.min(
    parseInt(optionalArg(args, "max-results") ?? "25", 10),
    250,
  );
  const query = optionalArg(args, "query");
  const singleEvents = optionalArg(args, "single-events") !== "false";
  const orderBy = optionalArg(args, "order-by") ?? "startTime";
  const account = optionalArg(args, "account");

  const response = await listEvents(calendarId, {
    timeMin,
    timeMax,
    maxResults,
    q: query,
    singleEvents,
    orderBy,
    account,
  });

  if (!response.ok) {
    printError(`Failed to list events: status ${response.status}`);
    return;
  }

  const result = response.data;
  if (!result.items?.length) {
    ok("No events found in the specified time range.");
    return;
  }

  ok(result);
}

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

async function get(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const eventId = requireArg(args, "event-id");
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const account = optionalArg(args, "account");

  const response = await getEvent(eventId, calendarId, account);

  if (!response.ok) {
    printError(`Failed to get event: status ${response.status}`);
    return;
  }

  ok(response.data);
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function create(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const summary = requireArg(args, "summary");
  const startRaw = requireArg(args, "start");
  const endRaw = requireArg(args, "end");
  const description = optionalArg(args, "description");
  const location = optionalArg(args, "location");
  const attendeesRaw = optionalArg(args, "attendees");
  const timezone = optionalArg(args, "timezone");
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const account = optionalArg(args, "account");
  const skipConfirm = args["skip-confirm"] === true;

  // Gate on user confirmation unless explicitly skipped
  if (!skipConfirm) {
    const messageParts = [
      `Summary: ${summary}`,
      `Start: ${startRaw}`,
      `End: ${endRaw}`,
    ];
    if (attendeesRaw) messageParts.push(`Attendees: ${attendeesRaw}`);
    if (location) messageParts.push(`Location: ${location}`);

    const confirmed = await requestConfirmation({
      title: "Create calendar event",
      message: messageParts.join("\n"),
      confirmLabel: "Create",
    });

    if (!confirmed) {
      ok({ created: false, reason: "User did not confirm" });
      return;
    }
  }

  // Determine if these are all-day events (date-only) or timed events
  const isAllDay = !startRaw.includes("T");

  const start = isAllDay
    ? { date: startRaw }
    : { dateTime: startRaw, timeZone: timezone };
  const end = isAllDay
    ? { date: endRaw }
    : { dateTime: endRaw, timeZone: timezone };

  const eventBody: Partial<CalendarEvent> = {
    summary,
    start,
    end,
  };

  if (description) eventBody.description = description;
  if (location) eventBody.location = location;
  if (attendeesRaw) {
    eventBody.attendees = parseCsv(attendeesRaw).map((email) => ({ email }));
  }

  const response = await createEvent(eventBody, calendarId, "all", account);

  if (!response.ok) {
    printError(`Failed to create event: status ${response.status}`);
    return;
  }

  const event = response.data;
  const link = event.htmlLink ? ` View it here: ${event.htmlLink}` : "";
  ok(`Event created (ID: ${event.id}).${link}`);
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

async function remove(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const eventIds = argv.flatMap((arg, index) => {
    if (arg !== "--event-id") return [];
    const value = argv[index + 1];
    return value && !value.startsWith("--") ? parseCsv(value) : [];
  });
  if (eventIds.length === 0) {
    requireArg(args, "event-id");
  }
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const account = optionalArg(args, "account");
  const sendUpdates =
    (optionalArg(args, "send-updates") as
      | "all"
      | "externalOnly"
      | "none"
      | undefined) ?? "all";
  const skipConfirm = args["skip-confirm"] === true;

  if (!["all", "externalOnly", "none"].includes(sendUpdates)) {
    printError(
      `Invalid --send-updates value: "${sendUpdates}". Must be all, externalOnly, or none.`,
    );
    return;
  }

  const events: CalendarEvent[] = [];
  for (const eventId of eventIds) {
    const eventResponse = await getEvent(eventId, calendarId, account);
    if (!eventResponse.ok) {
      printError(
        `Failed to get event ${eventId} before deletion: status ${eventResponse.status}`,
      );
      return;
    }
    events.push(eventResponse.data);
  }

  if (!skipConfirm) {
    const eventLines = events.map((event, index) => {
      const start = event.start?.dateTime ?? event.start?.date ?? "Unknown";
      return `${index + 1}. ${event.summary ?? eventIds[index]} — ${start}`;
    });
    const recurringCount = events.filter(
      (event) => event.recurringEventId,
    ).length;
    const confirmed = await requestConfirmation({
      title:
        events.length === 1
          ? "Delete calendar event"
          : `Delete ${events.length} calendar events`,
      message: [
        ...eventLines,
        recurringCount > 0
          ? `${recurringCount} recurring occurrence(s) will be removed without deleting their entire series.`
          : "",
        "This action cannot be undone from Vellum.",
      ]
        .filter(Boolean)
        .join("\n"),
      confirmLabel: "Delete",
    });

    if (!confirmed) {
      ok({ deleted: false, reason: "User did not confirm" });
      return;
    }
  }

  const deleted = [];
  for (let index = 0; index < eventIds.length; index++) {
    const eventId = eventIds[index];
    const response = await deleteEvent(
      eventId,
      calendarId,
      sendUpdates,
      account,
    );
    if (!response.ok) {
      printError(
        `Deleted ${deleted.length} of ${eventIds.length} events, then failed to delete ${eventId}: status ${response.status}`,
      );
      return;
    }
    const event = events[index];
    deleted.push({
      eventId,
      summary: event.summary ?? null,
      recurringEventId: event.recurringEventId ?? null,
    });
  }

  ok({
    deleted: true,
    deletedCount: deleted.length,
    events: deleted,
  });
}

// ---------------------------------------------------------------------------
// end-series
// ---------------------------------------------------------------------------

function formatRecurrenceUntil(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function endSeries(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const eventId = requireArg(args, "event-id");
  const cutoffRaw = requireArg(args, "cutoff");
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const account = optionalArg(args, "account");
  const sendUpdates =
    (optionalArg(args, "send-updates") as
      | "all"
      | "externalOnly"
      | "none"
      | undefined) ?? "all";
  const skipConfirm = args["skip-confirm"] === true;

  if (!["all", "externalOnly", "none"].includes(sendUpdates)) {
    printError(
      `Invalid --send-updates value: "${sendUpdates}". Must be all, externalOnly, or none.`,
    );
    return;
  }

  const cutoff = new Date(cutoffRaw);
  if (Number.isNaN(cutoff.getTime())) {
    printError(`Invalid --cutoff date: "${cutoffRaw}". Use an ISO 8601 value.`);
    return;
  }

  const eventResponse = await getEvent(eventId, calendarId, account);
  if (!eventResponse.ok) {
    printError(
      `Failed to get recurring event ${eventId}: status ${eventResponse.status}`,
    );
    return;
  }

  const event = eventResponse.data;
  if (!event.recurrence?.some((rule) => rule.startsWith("RRULE:"))) {
    printError(`Event ${eventId} is not a recurring series.`);
    return;
  }

  const until = formatRecurrenceUntil(new Date(cutoff.getTime() - 1000));
  const recurrence = event.recurrence.map((rule) => {
    if (!rule.startsWith("RRULE:")) return rule;
    const parts = rule
      .split(";")
      .filter(
        (part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT="),
      );
    return `${parts.join(";")};UNTIL=${until}`;
  });

  if (!skipConfirm) {
    const confirmed = await requestConfirmation({
      title: "End recurring calendar series",
      message: [
        `Series: ${event.summary ?? eventId}`,
        `Remove occurrences starting: ${cutoff.toISOString()}`,
        "Past occurrences will remain on the calendar.",
        "All later generated occurrences in this recurring series will be removed.",
      ].join("\n"),
      confirmLabel: "End series",
    });

    if (!confirmed) {
      ok({ ended: false, reason: "User did not confirm" });
      return;
    }
  }

  const response = await patchEvent(
    eventId,
    { recurrence },
    calendarId,
    sendUpdates,
    account,
  );
  if (!response.ok) {
    printError(`Failed to end recurring series: status ${response.status}`);
    return;
  }

  ok({
    ended: true,
    eventId,
    summary: event.summary ?? null,
    cutoff: cutoff.toISOString(),
    recurrence,
  });
}

// ---------------------------------------------------------------------------
// availability
// ---------------------------------------------------------------------------

async function availability(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const timeMin = requireArg(args, "time-min");
  const timeMax = requireArg(args, "time-max");
  const calendarIdsRaw = optionalArg(args, "calendar-ids") ?? "primary";
  const timezone = optionalArg(args, "timezone");
  const account = optionalArg(args, "account");

  const calendarIds = parseCsv(calendarIdsRaw);

  const response = await freeBusy(
    {
      timeMin,
      timeMax,
      timeZone: timezone,
      items: calendarIds.map((id) => ({ id })),
    },
    account,
  );

  if (!response.ok) {
    printError(`Failed to check availability: status ${response.status}`);
    return;
  }

  ok(response.data);
}

// ---------------------------------------------------------------------------
// rsvp
// ---------------------------------------------------------------------------

async function rsvp(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const eventId = requireArg(args, "event-id");
  const responseStatus = requireArg(args, "response") as
    | "accepted"
    | "declined"
    | "tentative";
  const calendarId = optionalArg(args, "calendar-id") ?? "primary";
  const account = optionalArg(args, "account");
  const skipConfirm = args["skip-confirm"] === true;

  // Validate response value
  const validResponses = ["accepted", "declined", "tentative"];
  if (!validResponses.includes(responseStatus)) {
    printError(
      `Invalid response: "${responseStatus}". Must be one of: accepted, declined, tentative`,
    );
    return;
  }

  // First GET the event to find the user's attendee entry
  const eventResponse = await getEvent(eventId, calendarId, account);

  if (!eventResponse.ok) {
    printError(`Failed to get event: status ${eventResponse.status}`);
    return;
  }

  const event = eventResponse.data;
  const selfAttendee = event.attendees?.find((a: EventAttendee) => a.self);

  if (!selfAttendee) {
    // If the user is the organizer and not in the attendees list,
    // they don't need to RSVP
    if (event.organizer?.self) {
      ok("You are the organizer of this event. No RSVP needed.");
      return;
    }
    ok(
      "Could not find your attendee entry for this event. You may not be invited.",
    );
    return;
  }

  // Gate on user confirmation unless explicitly skipped
  if (!skipConfirm) {
    const currentStatus = selfAttendee.responseStatus ?? "needsAction";
    const messageParts = [
      `Event: ${event.summary ?? eventId}`,
      `Current status: ${currentStatus}`,
      `New response: ${responseStatus}`,
    ];

    const confirmed = await requestConfirmation({
      title: "RSVP to calendar event",
      message: messageParts.join("\n"),
      confirmLabel: "RSVP",
    });

    if (!confirmed) {
      ok({ rsvp: false, reason: "User did not confirm" });
      return;
    }
  }

  // Update the attendee's response status
  const updatedAttendees = event.attendees!.map((a: EventAttendee) =>
    a.self ? { ...a, responseStatus } : a,
  );

  const patchResponse = await patchEvent(
    eventId,
    { attendees: updatedAttendees },
    calendarId,
    "all",
    account,
  );

  if (!patchResponse.ok) {
    printError(`Failed to RSVP: status ${patchResponse.status}`);
    return;
  }

  const responseLabel =
    responseStatus === "accepted"
      ? "Accepted"
      : responseStatus === "declined"
        ? "Declined"
        : "Tentatively accepted";
  ok(`${responseLabel} the event "${event.summary ?? eventId}".`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: gcal.ts <subcommand> [options]

Subcommands:
  list          List calendar events
  get           Get a single event by ID
  create        Create a new calendar event
  delete        Delete a calendar event
  end-series    Remove future occurrences while preserving past occurrences
  availability  Check free/busy availability
  rsvp          RSVP to a calendar event

Run with <subcommand> --help for subcommand-specific options.`);
    return;
  }

  switch (command) {
    case "list":
      await list(process.argv.slice(3));
      break;
    case "get":
      await get(process.argv.slice(3));
      break;
    case "create":
      await create(process.argv.slice(3));
      break;
    case "delete":
      await remove(process.argv.slice(3));
      break;
    case "end-series":
      await endSeries(process.argv.slice(3));
      break;
    case "availability":
      await availability(process.argv.slice(3));
      break;
    case "rsvp":
      await rsvp(process.argv.slice(3));
      break;
    default:
      printError(`Unknown subcommand: ${command}. Use --help for usage.`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    printError(err instanceof Error ? err.message : String(err));
  });
}
